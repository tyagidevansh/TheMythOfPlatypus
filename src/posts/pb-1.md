---
layout: layouts/post.njk
title: How I made my language faster than Python
description: A brief breakdown of all the techniques I've employed so far to make Pogberry ~blazingly fast~
date: 2026-09-06
author: Devansh
tags: [posts, code]
image: /assets/pb-1/header.png
imageAlt:
permalink: /posts/pb-devlog-1/
---

Pogberry (affectionately PB, I happened to find peanut butter extraordinarily delicious when I started working on this project) used to be a very slow language until recently. It started off as an extract reconstruction of Robert Nystrom's CLOX, implemented exactly as taught in his phenomenal book "Crafting Interpreters". I'm not faulting Mr. Crafting Interpreters one bit for CLOX (and by extension, PB) being excruciatingly slow, the primary goal of that book was to teach the classic foundations, and it does that extremely well. CLOX was never supposed to be a toy language, but it was first and foremost an educational tool. It _can_ do everything a programming language is supposed to do - it's Turing complete after all - but it was not meant for serious programming.

I am not making this statement simply because the bytecode interpreter was completely unoptimized and written for the sake of brevity, but because of other language design decisions that I will get into soon. As a small teaser for the first topic I will cover, Pogberry used an 8-bit unsigned integer for indexing constants inside each chunk. A chunk is a "logical unit" of a program, essentially a function. Originally, Pogberry could not contain more than 256 local variables inside a function, a very low ceiling indeed. Before I begin with this article proper, please do not think that the bytecode interpreter taught by the God Book was sub-par, it is truly an incredible book and I cannot recommend it enough. All the extra features I added (explored in another article hopefully) and the optimizations I did could only happen because I had the language already. I would've never made it if the book did not exist, and the book encouraged exploration.

## Anatomy of Pogberry

Pogberry is a dynamically typed, garbage-collected, stack-based bytecode virtual machine written in C. Over time, it evolved into a fully fledged language environment with first-class hash maps, dynamic list arrays, lexical closures, a modular standard library, and even a native C backend for graphical applications. At a high level, Pogberry is split into four pieces: the **scanner**, the **compiler**, the **runtime object system**, and the **virtual machine**. The compiler takes the source code and asks the scanner to convert it into tokens, parses those tokens and emits bytecode into chunks, with each function owning its own chunk of bytecode and associated constants. The runtime contains the objects that make up the language — strings, functions, closures, classes, instances, lists, hash maps, and so on — along with the garbage collector that manages their memory. Finally, the VM executes the compiler's bytecode using a stack-based execution model, maintaining call frames for functions and manipulating values on the VM stack. Around these core components sits the standard library and the native-function interface, which allow Pogberry code to interact with functionality implemented in C.

The bit that's the most important for this article is the VM. When executing a piece of code, PB does not execute native x86-64 machine code directly. Instead, it executes an artificial instruction set, much like an actual CPU's ISA. The responsibility for actually getting compiled down to assembly and the native ISA rests with GCC. Some important keywords to remember are:

1. **The Code Stream (Chunk):** An array of bytes containing opcodes (e.g., `OP_ADD`, `OP_GET_LOCAL`, `OP_JUMP`) and their operand payloads (such as variable indices or jump offsets).
2. **The Instruction Pointer (`ip`):** A raw pointer into that bytecode array tracking which instruction is currently executing.
3. **The Value Stack (`stack`):** A contiguous buffer of values (numbers, booleans, object references). Values are pushed, operated on, and popped.
4. **Call Frames (`CallFrame`):** When a function is invoked, a new frame records the caller’s return address, the closure being executed, and a pointer (`slots`) to where this function's local variables live on the value stack.

```
       Bytecode Stream                                Value Stack
    ┌─────────────────────────┐                   ┌─────────────────┐
    │ 0x00: OP_GET_LOCAL  1   │                   │ ...             │
    │ 0x02: OP_CONSTANT   0   │                   ├─────────────────┤
ip ─► 0x04: OP_EQUAL          │                   │ slot 1 (n = 32) │ ◄─ frame->slots
    │ 0x05: OP_POP_JUMP_IF... │                   ├─────────────────┤
    │ 0x08: ...               │                   │ 40              │
    └─────────────────────────┘                   ├─────────────────┤
                                      stackTop ──►│ 2               │
                                                  └─────────────────┘
```

At its core, the interpreter runs a continuous loop known as the **Fetch-Decode-Execute cycle**:

```c
for (;;) {
    uint8_t instruction = *ip++;
    switch (instruction) {
        case OP_CONSTANT: ... break;
        case OP_ADD:      ... break;
        case OP_RETURN:   ... break;
    }
}
```

This looks efficient enough. But at the silicon level, this loop is an absolute minefield for modern CPUs. Modern processors are REALLY fast at executing linear code with predictable memory access. If we wish to make our code fast, there are three main goals we should keep in mind - reduce the number of assembly instructions produced for any task, use less memory so we hit the cache as often as possible and try to make it so that the CPU does not have to guess too much about what code will execute next. Unsurprisingly all of these come with massive asterisks, but they hold true at a high level. This may be a good time to hand you something precious - a grain of salt. Remember this blog was written by a graduate of the prestigious Bharati Vidyapeeth's College of Engineering.

Anyway, modern CPUs make many techniques that break the traditional fetch-execute cycle most of us have in our minds. They rely on:

- **Out of order execution**: CPUs don't always execute code in the same order the assembly specifies, dozens of instructions (which don't rely on each other) are executed simultaneously, memory fetches are predicted hundreds of clock cycles and advance. Instructions in consecutive chunks of assembly code may get executed through completely separate pathways inside the CPU.
- **Branch prediction**: CPUs notice loops and keep track of which way an if-condition ends up evaluating most of the time. Based on this, on later iterations of a loop it bets which way the next iteration of the loop will jump and pre-loads the data required to execute that branch. If it guesses wrong, it has to clear everything it had gathered and go fetch the correct branch instead. This bet is usually worth it, as CPUs are fast but memory is slow. It is our job as language optimizers (?) to stack the gambling odds in the CPU's favour, for our own sake.
- **L1/L2 cache** - If possible, a CPU would MUCH RATHER always read from its registers or L1/L2 caches. Accessing data from registers is instantaneous, L1 or L2 caches take 4 to 12 clock cycles to access the data, whereas the main memory - even fast DDR5 - takes 300 to 350 clock cycles. And it only gets slower from there. This does not really apply to us, but simply to drive the point home at how much we must value cache locality, I'd like to state how many clock cycles it takes other forms of storage to get data to the CPU. If we were unlucky enough to hit a page fault on our super fast DDR5 memory and had to fetch that page from our equally state of the art PCIe Gen 5 NVMe SSD, it'd take us over 100,000 clock cycles! We'd have to wait around 500,000 cycles for the data to arrive from a SATA SSD and it can easily take 75 million clock cycles to fetch data from a mechanical hard drive. Let's just try to get as much data as we can from our precious L1 and L2 caches.

Our naive, educational implementation of a bytecode interpreter violates almost every single one of these preferences:

- **Slow dispatch**: Every single bytecode instruction must read a byte(see code blurb above for clarity, it's really what happens inside the VM), jump through a C switch table (an indirect JMP *rax) and repeat. The branch predictor struggles because every opcode jumps from a fixed start place to an essentially random place. Predicting hundreds of different destination targets isn't exactly feasible for our hardcoded (literally) branch predictor.
- **Memory Traffic Overload**: Pushing or popping values from the VM's stack calls C functions like push() or pop() that we had implemented. Every time a push or pop needs to happen, which is naturally quite often, the CPU must write the memory address of vm.stackTop, decrement of increment it, and spill registers onto the stack.
- **Cache Line Thrashing**: If bytecode encoding is too wide, or if we use too many of them for simple instructions, or if the data structures jump through pointers too much, CPU cache lines get saturated with useless data, and the data we actually need gets evicted.

To make Pogberry fast, my job was to eliminate these three bottlenecks. Here's the techniques employed so far, laid out chronologically so you could go take a gander at individual commits that introduced these changes if you wish to go deeper into the code changes.

## Bytecode Layout and Instruction Density

As stated previously, our teaching interpreter only used a single byte for many operants, including `OP_CONSTANT`, which means a chunk could only hold upto 256 constants. To support larger programs, the VM must support wide constants. An earlier approach, as suggested by the book itself was adding a 24-bit operand `OP_CONSTANT_LONG`, allowing 2^24 or about 16.7 million constants. However, in the last release of Pogberry this was never wired in, and the instruction merely existed in code. I wired it in this time, and also introduced a few more "wide" opcodes: `OP_GET_GLOBAL_LONG`, `OP_DEFINE_GLOBAL_LONG`, `OP_INVOKE_LONG`, `OP_CLOSURE_LONG`, etc. I will not explain what each of these opcodes do, as otherwise I'd never finish this article.

Soon, however, I decided to change all the wide operands to 16 bit instead. 24 bits seemed wasteful to me, I can't think of any reason a single Pogberry chunk would ever need 16.7 million constants. 16 bits gives us 65,536 constants to work with, and provides us generous 25% memory savings (1 byte for opcode + 2 bytes for the operand vs 3 bytes for the operand in the case of 24 bits). Another reason is that by default PB used 16 bits for jump instructions (`OP_JUMP` and `OP_LOOP`). Having fewer helper functions in a growing codebase seemed wise. The memory savings extend here too. Having 24 bit constants with 16 bit jump capabilities seemed lunatic, and increasing the memory assigned to each jump instruction would have had a massive impact on the language as a whole. Constants, globals, invocations, globals, closures (essentially functions), jumps and loops would all require more memory every instruction. That's pretty much the whole language.

Through all my stress testing, I have not hit the limit of my trusty 16-bit wide values yet. If this ever becomes a limitation, giving an extra byte to every instruction would be a pretty small change and hence I am not particularly stressed about the future impacts of my memory penny-pinching.

## Selective String Interning

String interning is the practice of storing only one copy of each unique string and having every occurrence of that string refer to the same object. This allows string equality to often be reduced to a cheap pointer comparison rather than comparing the contents character-by-character. Importantly, interning requires hashing, as we need to be able to look up whether a string has been interned and where it lives in an efficient manner. Lookups are indeed fast, but they are still hashmap lookups, not direct pointer accesses. And a pretty big hashing cost has to be paid upfront. Interning is worth it if this upfront cost can be amortized by repeated string access and indeed many languages, including famously Java, do this. The book mentioned that Java did this, and it honestly seemed like a great idea. What the book didn't mention is that almost every serious language _selectively_ interns strings. CLOX, and hence Pogberry, interned _every_ string.

Dear reader, string concatenation in Pogberry was 60 times slower than Python.

![Benchmark before any optimizations](/assets/pb-1/benchmark-1.png)

Before embarking on this adventure, I created a benchmarking suite that ran computationally intensive programs in Python and Pogberry, and measured their performance using the `perf` utility. Even without me doing anything both languages were relatively close. Pogberry was slower on average, but it wasn't disastrous. Strings were disastrous. Thankfully the truly awful performance was localized to one specific operation - string concatenation. Once I modified the benchmark to test all-round string performance, the gap dropped. But still, let's see what was going wrong with string interning, because fixing it was a major win for all benchmarked areas.

Consider this loop:

```pb
var i = 0;
while (i < 1000000) {
  var s = "item_" + str(i); // String concatenation & conversion
  i = i + 1;
}
```

If every intermediate string is interned:

1. Every dynamic string hashes its bytes (`hashString()`).
2. The runtime probes the global hash table `vm.strings`.
3. If not found, it inserts the string into `vm.strings`.
4. Inserting millions of transient strings causes `vm.strings` to constantly resize and rehash.
5. The GC must traverse thousands of dead string keys during each collection run, which are triggered often because of how much raw memory flux there is.

Let's stop and think why we even need string interning, are we better off without it? Well no, constant time lookups (still, remember that this is hashmap-lookup constant time, not true "constant time", we still have to pay a lot of computation tax) are quite valuable. Variable names, function names, class method names, map keys are checked repeatedly. In a recursive function for example we might have to lookup a function name millions of times. Here O(1) lookup is critical, we cannot rely on character-by-character comparisons here. On the other hand, numbers converted into strings just to be printed once, user inputs, sliced strings are often used once and thrown away. Similarly for the strings produced by repeated concatenations in our for loop above. Inserting these into the global intern table makes no sense. If we somehow end up using these strings in a user-side hashmap, we can just hash them then. No need to pay the penalty upfront, we can just deal with it when it arrives.

It is time for selective string interning, the technique _actually_ used by Java. I'll show some code for clarity.

```c
// src/headers/object.h & src/object.c
struct ObjString {
  Obj obj;
  int length;
  int capacity;
  char *chars;
  uint32_t hash;
  bool isInterned; // Flag tracking whether it belongs to vm.strings
};
```

1. Literals and identifiers are interned at compile time. When the compiler parses an identifier or constant string literal, it calls `copyString()`, which hashes and copies the string into the global `vm.strings` table and sets `isInterned = true`.
2. Transient strings bypass the intern table.
3. If an uninterned string is later used as a hash map key, its hash is computed on-demand once and cached in `string->hash`:
   ```c
   uint32_t stringGetHash(ObjString *string) {
     if (string->hash == 0) {
       string->hash = hashString(string->chars, string->length);
     }
     return string->hash;
   }
   ```

The result of this change, alongside fixing the benchmark to not be as lopsided anymore, was that string operations were now only about 50% slower in Pogberry compared to Python. Running just the original concat-only benchmark also resulted in about the same performance difference. Not quite a win yet, but it is important to note that Python also used far more memory. This will be a common theme throughout. While clowning on Python is a beloved hobby of mine, i do realise that it is a mature and well-made language, maintained by incredibly talented people. It uses more memory because it just has a lot more to keep track of. Pogberry is a far less capable language afterall. All the benchmarks use standard CPython as well. PyPy would absolutely wipe the floor with Pogberry in these benchmarks made of repetitive tasks. But hey, maybe Pogberry will have a JIT soon too, and then PyPy too will be taken down.

![Benchmark after selective string interning](/assets/pb-1/benchmark-2.png)

## Inlined Stack Operations

Originally, manipulating the evaluation stack looked like beautiful C code:

```c
void push(Value value) {
  *vm.stackTop = value;
  vm.stackTop++;
}

Value pop(void) {
  vm.stackTop--;
  return *vm.stackTop;
}
```

And inside `run()`:

```c
case OP_ADD: {
  Value b = pop();
  Value a = pop();
  push(NUMBER_VAL(AS_NUMBER(a) + AS_NUMBER(b)));
  break;
}
```

But now lets trace what the CPU has to do for a single addition:

1. Call `pop()`:
   - Load `vm.stackTop` from memory into a CPU register.
   - Decrement the pointer.
   - Dereference `vm.stackTop` to read `b`.
   - Store the updated `vm.stackTop` pointer back to the `vm` struct in memory.
2. Call `pop()` again for `a` (repeat all memory loads and stores).
3. Add the numbers.
4. Call `push()`:
   - Load `vm.stackTop` from memory.
   - Store the new `Value` at `*vm.stackTop`.
   - Increment `vm.stackTop`.
   - Write the updated pointer back to memory.

For a single `OP_ADD`, we performed multiple function calls, memory accesses, and redundant pointer writes. All of this needless churn means that the CPU can't keep the important `ip` and `stackTop` pointers in its registers because any function call or pointer dereference might force them to vacate that memory. The next time we'd have to look for the instruction pointer, which will have to happen naturally, we'll have to wait several clock cycles again.

In the standard implementation, all VM state is stored inside a single global struct:

```c
typedef struct {
  CallFrame frames[FRAMES_MAX];
  int frameCount;
  Value stack[STACK_MAX];
  Value *stackTop;
  // ...
} VM;

extern VM vm;
```

Inside `run()`, every instruction interacted with this state through struct dereferences and pretty C functions like the ones I mentioned a little while ago. For an example of a struct dereference, see the VM switch-case for pushing a local variable onto the stack:

```c
case OP_GET_LOCAL: {
  uint8_t slot = READ_BYTE();
  push(frame->slots[slot]); // Struct dereference + function call
  break;
}
```

We can inject speed (not the literal drug) into our VM through two relatively small changes. First, we hoist important pointers into local CPU registers. Instead of chasing pointers through the VM struct and individual call frames, we copy the active execution pointers into local variables at the top of `run()`:

```c
CallFrame *frame = &vm.frames[vm.frameCount - 1];
register uint8_t *ip = frame->ip;
Value *stackTop = vm.stackTop;
Value *slots = frame->slots;
```

Because `ip`, `stackTop` and `slots` are local to `run()`, the compiler safely allocates them directly into hardware general-purpose CPU registers and keeps them their as their addresses are never taken. This means that there are zero memory roundtrips to the vm struct during the inner run loop. This run loop is under our tight control as language authors. We can optimize this to the limit, and hence we should try to keep the program execution contained inside this function as much as possible. This will come up later, as in the current state of the VM it spends a sizeable chunk of its time outside `run()`. How this is possible and why it matters are questions that will be answered shortly. This is mentioned here to keep you reading.

![Time spent outside the core loop](/assets/pb-1/perf-1.png)

We're not done with this section yet. Beauty is only skin deep remember, and our pretty push and pop functions need to go. Calling a whole different C function for the simple act of pushing a value to the stack is so extra and bourgeois. We must not stand for this. A call frame for each push? Ridiculous. It's time for C macros.

```c
#define PUSH(value)       (*stackTop++ = (value))
#define POP()             (*(--stackTop))
#define DROP()            ((void)(--stackTop))
#define PEEK(distance)    (stackTop[-1 - (distance)])
```

Much better. Now `PUSH(val)` compiles down a single store instruction into the memory address held in the register for `stackTop` without the need for our code to jump to a whole another address to execute a simple function and then jump back in. Do not forget about the cache.

We've made incredible advances already, but we've introduced a potential problem as well. If `ip` and `stackTop` only live in CPU registers inside `run()`, the memory copies in `vm.stackTop` and `frame->ip` become stale. This creates three main issues:

1. The garbage collector is supposed to sweep all live roots, but if vm.stackTop memory is stale, newly pushed objects on the stack won't be marked and they'll be freed as garbage.
2. When `runtimeError()` fires, it inspects the instruction pointer to report the file line number. If `frame->ip` is stale, the error reporter points to the wrong instructions.
3. Native C functions like `join()` which we use in our stdlib of sorts access `vm.stackTop` directly.

This certainly seems scary, and I'd bet this is why Mr. Robert did not use this approach. Fear not though, we can solve this without sacrificing speed. Notice how these issues only appear at predictable points, namely when calling any operation that might allocate memory, call a native function or when returning from such a function. It's worth stating that Pogberry's GC is a stop-the-world GC. It triggers when the allocated memory exceeds a set threshold, and stops everything while it does its job. Our simple GC is not the kind to lurk in the shadows and stab allocated memory from behind, it only jumps into action when the program has grown to a certain size. This threshold grows with every time the GC is called. So for example, the first GC may be called at x bytes, the next one at 3x bytes, the one after that at 7x bytes and so on. Anyway, GC tangent aside, I added two synchronization macros that update the stale variables whenever they may be accessed directly. I don't think there is any reason to mention them here, but if you wish you can go look at them inside the source code - search for `STORE_FRAME()` and `LOAD_FRAME()`.

In summary, our old friend `OP_GET_LOCAL` now takes 2-3 CPU cycles to fetch a local variables, down from 20-30 cycles. Big win. There's a lot more to do.

## Fusing Opcodes

Consider standard control flow, a literal `if` statement. As simple as programming can get, short of printing Hello World. When you write an `if` statement, the bytecode that is produced looks something like this:

```
1. <evaluate condition>
2. OP_JUMP
2. Jump offset if conditional is false
3. OP_POP                      (pops condition if condition was true)
4. <then branch>
5. OP_JUMP exit
6. OP_POP                      (pops condition if condition was false)
7. <exit>
```

Notice that the VM executed an extra `OP_POP` opcode every single time a branch was taken. Executing 3 opcodes (`JUMP if false`, `JUMP if true`, `POP`) when the logic can be expressed in 1 opcode wastes precious CPU cycles. Admittedly this is benchmaxxing on my part. My benchmarks are repetitive after all, and they execute if-statements millions of times. But denser opcodes are an industry standard and are used often to make languages, or even CPUs faster. I am defending myself against an audience that isn't present, but if ISAs get to have newer instructions that just do multiple things, I get to have that too and call it a win. If statements are fundamental enough to any programming languages to warrant special treatment. Three new opcodes now exist:

- **OP_JUMP_IF_FALSE**: Pops the condition frm the stack and immediately jumps if falsey.
- **OP_JUMP_IF_TRUE_OR_POP**: If the top of the stack is truthy, it keeps the value on the stack and jumps over the rest of the expression. If it is falsey, it drops the value so the next operand can be evaluated. It makes `or` conditions inside if-conditionals faster.
- **OP_JUMP_IF_FALSE_OR_POP**: The opposite of above. Used for `and` conditions inside if-statements. Shortcircuits on falsey values.

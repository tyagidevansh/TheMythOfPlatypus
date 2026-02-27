---
layout: layouts/post.njk
title: Rediscovering Information Theory from first principles (with only a little bit of external help)
description: A month-long adventure trying to make a program that plays Wordle much better than I can.
date: 2026-02-27
tags: [posts, code]
author: Devansh
image: /assets/information-theory/header.png
imageAlt: Screenshot of the website
permalink: /posts/information-theory/
---

If you are reading this, you almost certainly know what Wordle is. In case you do not, please go play a few games before continuing. This article documents my month-long adventure trying to make a program that can play Wordle much better than I can.

I've recently gotten back into it and I'm not _terrible_, but I'm not great either. From what I've heard, an average score around 4 is considered good. That's what I set out to beat. My average at the time was somewhere around 4.77.

## Starting point: the Wordle clone

Naturally a language like Python would be more convenient for a project like this, but the ease of sharing that the web provides is hard to beat. Truthfully, the Wordle clone itself took an embarrassing amount of time to build. AI agents have genuinely lobotomised us - or at least they've lobotomised me. As someone who literally writes TypeScript for a living, getting a relatively simple HTML + JS project running properly was a major pain.

But I got there without once hitting `Ctrl+I` to summon Copilot, which felt like a small victory. On that note: this whole site is 0% React, after being one-shotted by the brilliant [justfuckingusehtml.com](https://justfuckingusehtml.com/). The load times - both hot-reload and when actually serving - have been absolutely worth it.

## Step one: letter frequency

Equipped with a Wordle clone that worked well enough, I started thinking about what a solver would actually need. The clone picked a random word on every page load with no mechanism to feed in information from any other wordle games. The aim of this tool was never to let people cheat on the New York Times - it was strictly a cool thing made for no reason other than the fact that I thought it would be cool.

The first thing I remembered was a 3Blue1Brown video on the same topic. I didn't let myself rewatch it, but I did remember the phrase _information theory_. So I Googled it, read the Wikipedia article, and learned absolutely nothing useful. The article on entropy was better - much better than most maths articles on there - but it was full of equations I was not remotely ready to engage with.

In the wise words of some nameless mathematician: if one problem is too hard, go solve an easier one.

Forgetting everything from that 3B1B video and thinking about the problem fresh, one idea surfaced immediately - **look at how frequently letters appear in words**. Say after a couple of guesses you have the following characters left untested: Q, W, E, I, and S. Which do you try first?

Almost everyone would try to get an E in before they even think about Q, and that intuition is grounded in reality. E is the most common letter in the English language when looking at five-letter words specifically.

For this step I worked with a list of **14,855 words** - every word Wordle considers a valid guess. The actual answer is drawn from a smaller list of roughly 2,000 words, but to keep the solver honest I deliberately didn't use that list.

The algorithm:

1. Walk through every word and build a frequency map - how many times does each letter appear across all 14,855 words?
2. Walk through the list again; for each word, take the **set** of its unique letters and sum their frequencies. That sum is the word's score.
3. Sort by score descending. The top word is your best opening guess.

Every time a guess is made and we receive feedback, the candidate list shrinks - words that can no longer be the answer get filtered out - and we re-score and re-sort whatever's left. Even at 14k words this is practically instantaneous. Computers are fast.

```js
function scoreWord(word, freq) {
  const letters = new Set(word.split(""));
  let score = 0;
  for (const ch of letters) score += freq[ch] ?? 0;
  return score;
}
```

You might wonder why we use a _set_ rather than summing the raw letter counts per word. Words with two or more E's would otherwise dominate the ranking, even though having two E's doesn't really help us - we want to maximise the number of _distinct_ letters tried, not the number of positions. Words like "agree" should not be scoring higher than "stare".

This method is crude, but it works surprisingly well. The simple frequency-based solver consistently finishes in five guesses or fewer and almost never loses outright. But naturally this is no place to rest. One hashmap and one set is no fun. It's time for information theory - for real this time.

## What information actually is

Information is made up of smaller parts. These parts are atomic. Letters of an alphabet, handsigns, individual bits in computer memory, each carries meaning by itself. Crucially, by being _one thing_, each of these elements tells you what it is _not_. When a bit is 1, you know it isn't 0. Hence, even if we know if an element does _not_
occur in our word, we recieve new information.

When we communicate something, we can do it in many different ways as long as we get the point across. Some ways are clearly more efficient than others. A message that halves the number of possible answers is, in a precise and measurable sense, worth more than a message that only rules out one possibility.

This is where entropy comes in - and where the Wordle problem suddenly gets a lot more interesting.

## Entropy: measuring useful-ness

The formal definition of entropy looks like this:

$$H = -\sum_{i} p_i \log_2 p_i$$

It isn't really a scary formula once you stare at it for a few minutes, and what it actually means is: given an alphabet of possible outcomes, each with some probability of occurring, entropy is the _average number of bits of information_ you'd learn from observing one outcome. The higher the entropy, the more you learn on average. A coin flip has 1 bit of entropy. A six-sided die has about 2.58 bits. Let's not worry too much about what `bits` or `entropy` means for now. I can't define them myself.

For Wordle, I want to measure: **if I guess this word, how much will I learn on average?**

Every guess produces a pattern of coloured tiles: green (right letter, right position), yellow (right letter, wrong position), or grey (letter not in the word). Since there are five positions and three possible outcomes each, there are $3^5 = 243$ distinct patterns. I precomputed all of them and stored them in an array called `permutations`, using G, Y, and B (for black/grey) as shorthand.

For a given guess word, the entropy calculation works like this:

1. For each of the 243 patterns, simulate "what if the answer produced this pattern?" and then use the pattern to filter the current candidate list down to only the words consistent with it.
2. The fraction of candidate words that survive is the _probability_ of seeing that pattern: $p = \text{remaining} / \text{total}$
3. Plug it into the entropy formula: $H = -\sum p \log_2 p$

```js
const calculateEntropyForWord = (guessWord, wordObjects) => {
  let entropy = 0;
  const patternCounts = {};

  for (let j = 0; j < permutations.length; j++) {
    const pattern = permutations[j];
    const constraints = patternToConstraints(guessWord, pattern);
    const remainingWords = filterWordList(
      wordObjects,
      constraints.greens,
      constraints.yellows,
      constraints.grays,
      constraints.yellowPositions,
    );
    patternCounts[pattern] = remainingWords.length;
  }

  for (let pattern in patternCounts) {
    const count = patternCounts[pattern];
    if (count > 0) {
      const p = count / wordObjects.length;
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
};
```

A word that produces wildly different patterns depending on the answer will have high entropy - it's carving up the solution space evenly, which is what we want. A word that almost always returns all-grey tells us almost nothing and has entropy close to zero.

## Turning a pattern into constraints

The bit that took the most careful thinking (and SO MUCH wasted time looking for random bugs (there may still be bugs)) was `patternToConstraints`, i.e. converting a G/Y/B string back into the filtering rules the solver uses. This matters because the entropy calculation _simulates_ every possible pattern, so it needs to correctly derive what each pattern implies about the answer.

The rules sound simple but have edge cases:

- **Green** at position $i$: the answer has this exact letter at position $i$.
- **Yellow** at position $i$: the answer contains this letter, but _not_ at position $i$.
- **Grey**: the answer has _at most_ as many of this letter as you've already confirmed through greens and yellows.

That last rule is the subtle one. If you guess "SPEED" and both E's come back grey, the answer has no E at all. But if one E is yellow and the other is grey, the answer has _exactly one_ E. The grey doesn't mean "absent", it means "no more than accounted for". Getting this wrong causes the solver to incorrectly eliminate valid words.

```js
} else if (pattern[i] === "B") {
  let isGreenOrYellow = false;
  for (let j = 0; j < 5; j++) {
    if (guessWord[j] === letter && (pattern[j] === "G" || pattern[j] === "Y")) {
      isGreenOrYellow = true;
      break;
    }
  }
  if (!isGreenOrYellow && !grays.includes(letter)) {
    grays.push(letter);
  }
}
```

Only push a letter to `grays` if it doesn't appear anywhere as green or yellow. The actual filtering step then checks how many times each grey letter appears in a candidate word vs. how many times it's accounted for by greens and yellows:

```js
for (let grayLetter of grays) {
  let allowedCount = 0;
  for (let i = 0; i < 5; i++) {
    if (greens[i] === grayLetter) allowedCount++;
  }
  for (let yellowLetter of yellows) {
    if (yellowLetter === grayLetter) allowedCount++;
  }
  let actualCount = 0;
  for (let i = 0; i < 5; i++) {
    if (word[i] === grayLetter) actualCount++;
  }
  if (actualCount > allowedCount) return false;
}
```

## The scoring function: entropy + probability

Pure entropy has one problem: it doesn't distinguish between words that are plausible answers and words that are just good at narrowing the field. "XYLYL" might have decent entropy but has a near-zero probability of ever being the actual answer. Winning in three guesses is better than winning in four even if you technically gathered the same information.

My scoring function adds a weighted probability term:

```js
const score = entropy + wordObj.probability * 2;
```

The multiplier of 2 is entirely vibes based. I did not test all that many possibilities. I tested a few, and 2 worked well and just looked good so this is what we go with. Weighting probability too high makes it degenerate back to just guessing words based on their frequency-derived probability. Too low and it starts recommending obscure words that are technically informative but will never appear as answers. All of this could have been avoided (and our solver would've been much better) if I'd used the actual possible answers list, not a random list of "all 5 letter words" from GitHub. But aye, integrity am I right?

## What the solver actually recommends

With all of this in place, the precomputed opening recommendations came out as:

| Word  | Entropy (bits) | Probability |
| ----- | -------------- | ----------- |
| rates | 6.714          | 0.9706      |
| laser | 6.250          | 0.8979      |
| tears | 6.551          | 0.7187      |
| raise | 6.282          | 0.8479      |
| arise | 6.056          | 0.6978      |

"RATES" is the top pick. Not "CRANE", not "SLATE", not "ADIEU". Honestly, this doesn't come as a surprise to me at all. Because, as previously stated I've watched those two 3B1B videos on this topic. I do remember he found "CRANE" to be the best opener in his original video, and later found it to be because of a bug. I do not recall if "RATES" was crowned winner by him too but in practice, the difference between the top ten openers is small enough that it barely matters.

Truthfully, the title of this PR is clickbait, I had plenty of exterrnal help.

## Tracking information in real time

One thing I added later that turned out to be genuinely interesting is tracking _actual_ vs _expected_ information gain per guess.

**Expected** information gain is just the entropy of the word you're about to guess - calculated before you submit it, over the current candidate list.

**Actual** information gain is calculated after you see the pattern:

$$I = -\log_2 p(\text{pattern})$$

where $p(\text{pattern})$ is the fraction of candidate words that would have produced the pattern you received. If your guess eliminated 90% of remaining possibilities, you gained about 3.32 bits. If it only eliminated 10%, you gained about 0.15 bits.

```js
if (patternProb > 0) {
  actualInfoGain = -Math.log2(patternProb);
}
```

The gap between expected and actual tells you how lucky or unlucky your guess was. If expected was 5.2 bits and actual was 1.1 bits, you simply got unlucky and the answer is in a particularly rare part of the possibility space.

## Does it beat 4?

Yes, actually. I ran the solver through 1,000 randomly selected words to get a proper benchmark:

- **Solve rate:** 987/1000 (98.7%)
- **Average guesses:** 3.888
- **Median:** 4 guesses

**Distribution:**

| Tries | Count | Percentage |
| ----- | ----- | ---------- |
| 2     | 42    | 4.2%       |
| 3     | 329   | 32.9%      |
| 4     | 394   | 39.4%      |
| 5     | 169   | 16.9%      |
| 6     | 66    | 6.6%       |

So it beats my 4.77 average by nearly a full guess, solves in 3 or fewer about a third of the time, and fails on only 13 words out of a thousand. The failures could be due to some hard-to-catch bug. It is also possible that we simply do not have a few words which are in the guess list but not in the word list that I am using. For a few the state space may genuinely not collapse in 6 guesses. I'm sure I could make this solver a lot better. Mayhaps 100% solve rate would not be possible, but I think I could definetely do a lot better than 3.9 average guesses. A quick Google search reveals the "optimal wordle solver takes around 3.5 guesses per average". I am quite far from that yet, but I think this is a good place to stop for now. There are other projects to do and shiny new things to learn.

---

Thank you for reading this article! It really means a lot to me if you got to this point. The full solver is playable [here](https://tyagidevansh.github.io/wordle-bot/) if you want to see it in action. The source is exactly as described above. No libraries, no frameworks, just a word list and some entropy arithmetic running in your browser.

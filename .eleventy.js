module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addFilter("readableDate", function (dateObj) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(dateObj);
  });

  eleventyConfig.addFilter("readingTime", function (content) {
    const text = content.replace(/<[^>]*>/g, "");
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  });

  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    pathPrefix: process.env.ELEVENTY_PATH_PREFIX || "/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addFilter("readableDate", function (dateObj) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(dateObj);
  });

  eleventyConfig.addFilter("compressedDate", (date) => {
    const d = new Date(date);
    const currentYear = new Date().getFullYear();

    if (d.getFullYear() === currentYear) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }

    return d.getFullYear().toString();
  });

  eleventyConfig.addFilter("readingTime", function (content) {
    const text = content.replace(/<[^>]*>/g, "");
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  });

  eleventyConfig.addFilter("isoDate", function (dateObj) {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  });

  eleventyConfig.addFilter("absoluteUrl", function (urlPath, base) {
    if (!urlPath) return "";
    if (/^https?:\/\//i.test(urlPath)) return urlPath;

    const baseOrigin = (
      base ||
      process.env.SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
        `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
      (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
      "https://the-myth-of-platypus.vercel.app"
    ).trim();

    try {
      const parsedBase = new URL(
        baseOrigin.startsWith("http") ? baseOrigin : "https://" + baseOrigin
      );
      const basePath = parsedBase.pathname.replace(/\/+$/, "");
      const cleanPath = urlPath.startsWith("/") ? urlPath : "/" + urlPath;

      if (
        basePath &&
        (cleanPath === basePath || cleanPath.startsWith(basePath + "/"))
      ) {
        return parsedBase.origin + cleanPath;
      }

      return parsedBase.origin + basePath + cleanPath;
    } catch {
      return urlPath;
    }
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


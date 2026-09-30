const fs = require("fs");
const path = require("path");

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

  eleventyConfig.addFilter("imageInfo", function (urlPath) {
    if (!urlPath) return null;
    const clean = urlPath.replace(/^\//, "");
    let filePath = path.join(__dirname, "src", clean);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, clean);
    }
    if (!fs.existsSync(filePath)) return null;

    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
        ? "image/png"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".svg"
        ? "image/svg+xml"
        : "image/jpeg";

    try {
      const buf = fs.readFileSync(filePath);
      let width, height;

      if (ext === ".png" && buf.length >= 24 && buf.toString("ascii", 12, 16) === "IHDR") {
        width = buf.readUInt32BE(16);
        height = buf.readUInt32BE(20);
      } else if ((ext === ".jpg" || ext === ".jpeg") && buf.length > 8) {
        let i = 2;
        while (i < buf.length - 8) {
          if (buf[i] !== 0xff) {
            i++;
            continue;
          }
          const marker = buf[i + 1];
          if (marker === 0xc0 || marker === 0xc2) {
            height = buf.readUInt16BE(i + 5);
            width = buf.readUInt16BE(i + 7);
            break;
          }
          const len = buf.readUInt16BE(i + 2);
          i += 2 + len;
        }
      }

      return { width, height, mime };
    } catch {
      return { mime };
    }
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

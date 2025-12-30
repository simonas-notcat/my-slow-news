import { describe, test, expect } from "vitest";
import {
  decodeHtmlEntities,
  parseDocument,
  extractText,
  extractTextFromHtml,
  extractTitle,
  extractArticle,
  extractForDomain,
  removeNonContentElements,
  findMainContent,
  findBestContentContainer,
  sanitizeForMarkdown,
  getTextContent,
  extractNumber,
} from "./html-parser";

describe("decodeHtmlEntities", () => {
  test("decodes named entities", () => {
    expect(decodeHtmlEntities("&amp;")).toBe("&");
    expect(decodeHtmlEntities("&lt;")).toBe("<");
    expect(decodeHtmlEntities("&gt;")).toBe(">");
    expect(decodeHtmlEntities("&quot;")).toBe('"');
    expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
    expect(decodeHtmlEntities("&copy;")).toBe("©");
  });

  test("decodes decimal entities", () => {
    expect(decodeHtmlEntities("&#38;")).toBe("&");
    expect(decodeHtmlEntities("&#60;")).toBe("<");
    expect(decodeHtmlEntities("&#62;")).toBe(">");
    expect(decodeHtmlEntities("&#8217;")).toBe("\u2019"); // Right single quote (U+2019)
    expect(decodeHtmlEntities("&#8220;")).toBe("\u201C"); // Left double quote (U+201C)
  });

  test("decodes hex entities", () => {
    expect(decodeHtmlEntities("&#x26;")).toBe("&");
    expect(decodeHtmlEntities("&#x3C;")).toBe("<");
    expect(decodeHtmlEntities("&#x3E;")).toBe(">");
    expect(decodeHtmlEntities("&#X3E;")).toBe(">"); // uppercase X
    expect(decodeHtmlEntities("&#x2019;")).toBe("\u2019"); // Right single quote (U+2019)
  });

  test("handles mixed entities", () => {
    expect(decodeHtmlEntities("Hello &amp; World")).toBe("Hello & World");
    expect(decodeHtmlEntities("&lt;div&gt;test&lt;/div&gt;")).toBe(
      "<div>test</div>"
    );
    expect(decodeHtmlEntities("&#60;&#38;&#62;")).toBe("<&>");
  });

  test("preserves unknown entities", () => {
    expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
  });

  test("handles empty input", () => {
    expect(decodeHtmlEntities("")).toBe("");
  });
});

describe("parseDocument", () => {
  test("parses basic HTML", () => {
    const doc = parseDocument("<html><body><p>Hello</p></body></html>");
    expect(doc.querySelector("p")?.textContent).toBe("Hello");
  });

  test("parses HTML with attributes", () => {
    const doc = parseDocument('<div class="test" id="main">Content</div>');
    const div = doc.querySelector("#main");
    expect(div?.getAttribute("class")).toBe("test");
  });
});

describe("extractText", () => {
  test("extracts text from element", () => {
    const doc = parseDocument("<div>Hello   World</div>");
    const div = doc.querySelector("div");
    expect(extractText(div)).toBe("Hello World");
  });

  test("decodes entities in text", () => {
    const doc = parseDocument("<div>Hello &amp; World</div>");
    const div = doc.querySelector("div");
    expect(extractText(div)).toBe("Hello & World");
  });

  test("handles null element", () => {
    expect(extractText(null)).toBe("");
  });
});

describe("extractTextFromHtml", () => {
  test("extracts content from simple HTML", () => {
    const html = "<html><body><p>Hello World</p></body></html>";
    expect(extractTextFromHtml(html)).toBe("Hello World");
  });

  test("removes script and style elements", () => {
    const html = `
      <html>
        <head><style>.test { color: red; }</style></head>
        <body>
          <script>alert('hi')</script>
          <p>Content</p>
        </body>
      </html>
    `;
    const result = extractTextFromHtml(html);
    expect(result).toContain("Content");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color: red");
  });

  test("removes navigation elements", () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <article>Main Content</article>
        <footer>Footer Links</footer>
      </body></html>
    `;
    const result = extractTextFromHtml(html);
    expect(result).toContain("Main Content");
    expect(result).not.toContain("Home");
    expect(result).not.toContain("Footer Links");
  });

  test("finds article content", () => {
    const html = `
      <html><body>
        <header>Site Header</header>
        <article>
          <h1>Article Title</h1>
          <p>This is the main article content with enough text to be considered meaningful.</p>
        </article>
        <aside>Sidebar</aside>
      </body></html>
    `;
    const result = extractTextFromHtml(html);
    expect(result).toContain("Article Title");
    expect(result).toContain("main article content");
  });

  test("handles empty input", () => {
    expect(extractTextFromHtml("")).toBe("");
    expect(extractTextFromHtml(null as unknown as string)).toBe("");
  });
});

describe("extractTitle", () => {
  test("extracts title from title tag", () => {
    const html = "<html><head><title>Page Title</title></head></html>";
    expect(extractTitle(html)).toBe("Page Title");
  });

  test("extracts title from og:title", () => {
    const html =
      '<html><head><meta property="og:title" content="OG Title"></head></html>';
    expect(extractTitle(html)).toBe("OG Title");
  });

  test("falls back to h1", () => {
    const html = "<html><body><h1>Heading Title</h1></body></html>";
    expect(extractTitle(html)).toBe("Heading Title");
  });

  test("decodes entities in title", () => {
    const html = "<html><head><title>Test &amp; Title</title></head></html>";
    expect(extractTitle(html)).toBe("Test & Title");
  });

  test("handles missing title", () => {
    const html = "<html><body><p>No title here</p></body></html>";
    expect(extractTitle(html)).toBe("");
  });
});

describe("extractArticle", () => {
  test("extracts article with title and content", () => {
    const html = `
      <html>
        <head><title>Article Title</title></head>
        <body>
          <article>
            <p>This is the article content with meaningful text.</p>
          </article>
        </body>
      </html>
    `;
    const result = extractArticle(html);
    expect(result.title).toBe("Article Title");
    expect(result.content).toContain("article content");
    expect(result.excerpt.length).toBeLessThanOrEqual(303); // 300 + "..."
  });
});

describe("extractForDomain", () => {
  test("extracts GitHub content", () => {
    const html = `
      <html><body>
        <article class="markdown-body">
          <h1>Project README</h1>
          <p>This is a GitHub repository with documentation.</p>
        </article>
      </body></html>
    `;
    const result = extractForDomain(html, "github.com");
    expect(result).toContain("Project README");
    expect(result).toContain("documentation");
  });

  test("extracts Medium content", () => {
    const html = `
      <html><body>
        <article>
          <h1>Blog Post</h1>
          <p>This is a Medium article with interesting content.</p>
        </article>
      </body></html>
    `;
    const result = extractForDomain(html, "medium.com");
    expect(result).toContain("Blog Post");
    expect(result).toContain("interesting content");
  });

  test("falls back to generic extraction for unknown domains", () => {
    const html = `
      <html><body>
        <main>
          <p>Generic content from unknown site.</p>
        </main>
      </body></html>
    `;
    const result = extractForDomain(html, "unknown-site.com");
    expect(result).toContain("Generic content");
  });
});

describe("removeNonContentElements", () => {
  test("removes script elements", () => {
    const doc = parseDocument(
      "<html><body><script>code</script><p>Content</p></body></html>"
    );
    removeNonContentElements(doc);
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("p")).not.toBeNull();
  });

  test("removes nav and footer", () => {
    const doc = parseDocument(`
      <html><body>
        <nav>Navigation</nav>
        <main>Content</main>
        <footer>Footer</footer>
      </body></html>
    `);
    removeNonContentElements(doc);
    expect(doc.querySelector("nav")).toBeNull();
    expect(doc.querySelector("footer")).toBeNull();
    expect(doc.querySelector("main")).not.toBeNull();
  });

  test("removes elements with navigation roles", () => {
    const doc = parseDocument(`
      <html><body>
        <div role="navigation">Nav</div>
        <div role="main">Content</div>
        <div role="contentinfo">Info</div>
      </body></html>
    `);
    removeNonContentElements(doc);
    expect(doc.querySelector('[role="navigation"]')).toBeNull();
    expect(doc.querySelector('[role="contentinfo"]')).toBeNull();
    expect(doc.querySelector('[role="main"]')).not.toBeNull();
  });
});

describe("findMainContent", () => {
  test("finds article element", () => {
    const doc = parseDocument(`
      <html><body>
        <header>Header</header>
        <article>
          <p>This is the main article content with enough text to pass the threshold check for meaningful content.</p>
        </article>
      </body></html>
    `);
    const main = findMainContent(doc);
    expect(main?.tagName.toLowerCase()).toBe("article");
  });

  test("finds main element", () => {
    const doc = parseDocument(`
      <html><body>
        <header>Header</header>
        <main>
          <p>This is the main content area with enough text to be considered meaningful content for extraction. Adding more text to exceed the threshold.</p>
        </main>
      </body></html>
    `);
    const main = findMainContent(doc);
    expect(main?.tagName.toLowerCase()).toBe("main");
  });

  test("falls back to body", () => {
    const doc = parseDocument("<html><body><p>Short</p></body></html>");
    const main = findMainContent(doc);
    expect(main?.tagName.toLowerCase()).toBe("body");
  });
});

describe("findBestContentContainer", () => {
  test("scores divs by content density", () => {
    const doc = parseDocument(`
      <html><body>
        <div class="sidebar">Short sidebar content</div>
        <div class="content">
          <p>This is the main content area.</p>
          <p>It has multiple paragraphs.</p>
          <p>And much more text than the sidebar, making it the better candidate for content extraction.</p>
        </div>
      </body></html>
    `);
    const container = findBestContentContainer(doc);
    expect(container?.getAttribute("class")).toBe("content");
  });
});

describe("sanitizeForMarkdown", () => {
  test("escapes angle brackets", () => {
    expect(sanitizeForMarkdown("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes square brackets", () => {
    expect(sanitizeForMarkdown("[link](url)")).toBe("\\[link\\](url)");
  });

  test("escapes pipes", () => {
    expect(sanitizeForMarkdown("col1 | col2")).toBe("col1 \\| col2");
  });

  test("escapes backticks", () => {
    expect(sanitizeForMarkdown("`code`")).toBe("\\`code\\`");
  });
});

describe("getTextContent", () => {
  test("extracts text from element", () => {
    const doc = parseDocument("<div>  Hello World  </div>");
    expect(getTextContent(doc.querySelector("div"))).toBe("Hello World");
  });

  test("handles null element", () => {
    expect(getTextContent(null)).toBe("");
  });
});

describe("extractNumber", () => {
  test("extracts number from text", () => {
    expect(extractNumber("123 points")).toBe(123);
    expect(extractNumber("Score: 456")).toBe(456);
  });

  test("returns 0 for no number", () => {
    expect(extractNumber("no numbers")).toBe(0);
  });

  test("extracts first number", () => {
    expect(extractNumber("1st of 10")).toBe(1);
  });
});

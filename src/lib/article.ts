import {Readability, isProbablyReaderable } from '@mozilla/readability';

export async function fetchArticle(url: string): Promise<App.Article | null> {
    // Fetch the HTML content of the URL and parse it with JSDOM
    const response = await fetch(`https://api.allorigins.win/get?url=${url}`);
    const json = await response.json();

    const html = json.contents;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Check if the content is suitable for Readability
    if (!isProbablyReaderable(doc)) {
        throw new Error("The page is not reader-friendly.");
    }

    // Extract the main content using Readability
    const reader = new Readability(doc);
    const article: App.Article | null = reader.parse() as App.Article | null;

    if (!article) return null;

    article.url = url;

    return article;
}

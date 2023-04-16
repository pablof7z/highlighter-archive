import Dexie, { type Table } from 'dexie';

export class Database extends Dexie {
    articles!: Table<App.Article>;
    highlights!: Table<App.Highlight>;
    notes!: Table<App.Note>;
    users!: Table<App.UserProfile>;

    constructor() {
        super('db');
        this.version(15).stores({
            articles: '++id, url, publisher, content, author, event, title',
            highlights: 'id, url, pubkey, event, content, articleId',
            notes: 'id, url, pubkey, replyToArticleId, replyToEventId, event, content',
            users: '++id, name, displayName, image, banner, bio, nip05, lud16, about, zapService',
        });
    }
}

export const db = new Database();

import Dexie, { type Table } from 'dexie';

export class Database extends Dexie {
    articles!: Table<App.Article>;
    highlights!: Table<App.Highlight>;
    notes!: Table<App.Note>;
    users!: Table<App.UserProfile>;
    zaps!: Table<App.Zap>;

    constructor() {
        super('zapworthy');
        this.version(17).stores({
            articles: '++id, url, publisher, content, author, event, title',
            highlights: '++id, url, pubkey, event, content, articleId, timestamp',
            notes: '++id, url, pubkey, replyToArticleId, replyToEventId, event, content',
            users: '++id, name, displayName, image, banner, bio, nip05, lud16, about, zapService, event',
            zaps: '++id, zapper, zappee, zapped, zappedEvent, amount, comment, event'
        });
    }
}

export const db = new Database();

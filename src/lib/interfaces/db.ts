import Dexie, { type Table } from 'dexie';

export class Database extends Dexie {
    articles!: Table<App.Article>;
    bookmarkLists!: Table<App.BookmarkList>;
    highlights!: Table<App.Highlight>;
    encryptedNotes!: Table<App.EncryptedNote>;
    notes!: Table<App.Note>;
    users!: Table<App.UserProfile>;
    zaps!: Table<App.Zap>;

    constructor() {
        super('highlighter');
        this.version(28).stores({
            articles: '++id, url, publisher, content, author, event, title',
            bookmarkLists: '++id, pubkey, title',
            highlights: '++id, url, pubkey, boostedBy, event, content, articleId, timestamp',
            encryptedNotes: '++id, pubkey, event, encryptedContent',
            notes: '++id, url, pubkey, replyToArticleId, replyToEventId, quotesEventId, event, content, createdAt',
            users: '++id, name, displayName, image, banner, bio, nip05, lud16, about, zapService, event',
            zaps: '++id, zapper, zappee, zapped, zappedEvent, amount, comment, event, zappedEventKind'
        });
    }
}

export const db = new Database();

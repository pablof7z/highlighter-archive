declare global {
    namespace App {
        interface Article {
            id?: string;
            url: string;
            title: string;
            publisher: string;
            tags: string[];
            content: string;
            author?: string;
            event: string;
        }

        interface Highlight {
            id?: string;
            url?: string;
            pubkey: string;
            boostedBy?: string;
            content: string;
            context?: string;
            articleId?: string;
            event?: string;
            timestamp?: number;
            scope?: string;
        }

        interface Note {
            id?: string;
            pubkey: string;
            content: string;
            replyToArticleId?: string;
            replyToEventId?: string;
            quotesEventId?: string;
            event: string;
            createdAt: number;
        }

        interface BookmarkList {
            id: string;
            pubkey: string;
            title: string;
            description: string;
            naddr: string;
            createdAt: number;
            event: string;
        }

        interface EncryptedNote {
            id: string;
            pubkey: string;
            encryptedContent: string;
            isAtlasMessage: boolean;
            event: string;
        }

        interface UserProfile {
            id?: string;
            name?: string;
            displayName?: string;
            image?: string;
            banner?: string;
            bio?: string;
            nip05?: string;
            lud16?: string;
            about?: string;
            zapService?: string;
            event: string;
        }

        interface Zap {
            id?: string;
            zapper: string; // pubkey of zapper app
            zappee: string; // pubkey of user sending zap
            zapped: string; // pubkey of user receiving zap
            zappedNote?: string; // note from zapper to zapped
            amount: number;
            comment?: string;
            event: string;
        }
    }
}

export {};

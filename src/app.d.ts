declare global {
    namespace App {
        interface Article {
            id?: string;
            url: string;
            title: string;
            publisher: string;
            content: string;
            author?: string;
            event: string;
        }

        interface Highlight {
            id?: string;
            url: string;
            pubkey: string;
            content: string;
            articleId?: string;
            event: string;
        }

        interface Note {
            id?: string;
            pubkey: string;
            content: string;
            replyToArticleId?: string;
            replyToEventId?: string;
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
        }
    }
}

export {};

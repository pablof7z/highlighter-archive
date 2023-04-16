import { get as getStore } from 'svelte/store';
import {ndk as ndkStore} from '../store';
import { liveQuery } from 'dexie';
import { db } from '$lib/interfaces/db.js';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import {nip19} from 'nostr-tools';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

interface ILoadOpts {
    pubkeys?: string[];
    articleNaddr?: string;
    url?: string;
};

const HighlightInterface = {
    fromIds: (ids: string[]) => {
        return liveQuery(() =>
            db.highlights.where('id').anyOf(ids).toArray()
        );
    },

    load: (opts: ILoadOpts = {}) => {
        const filter: NDKFilter = { kinds: [9801], limit: 1 };
        if (opts.pubkeys) filter['authors'] = opts.pubkeys;

        let articleReference: string | undefined;

        if (opts.articleNaddr) {
            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`
            filter['#a'] = [articleReference];
        }

        if (opts.url) filter['#r'] = [opts.url];

        console.log({filter});


        const ndk: NDK = getStore(ndkStore);

        const subs = ndk.subscribe(filter);

        subs.on('event', async (event: NDKEvent) => {
            const url = valueFromTag(event, 'r');

            if (!url) return;

            try {
                const articleId = valueFromTag(event, 'a');

                const highlight: App.Highlight = {
                    id: event.tagId(),
                    url,
                    pubkey: event.pubkey,
                    content: event.content,
                    articleId,
                    event: JSON.stringify(await event.toNostrEvent())
                };

                await db.highlights.put(highlight);
            } catch (e) {
                console.error(e);
            }
        });

        if (opts.pubkeys) {
            return liveQuery(() =>
                db.highlights.where('pubkey').anyOf(opts.pubkeys as string[]).toArray()
            );
        } else if (articleReference) {
            return liveQuery(() =>
                db.highlights.where({articleId: articleReference}).toArray()
            );
        } else if (opts.url) {
            return liveQuery(() =>
                db.highlights.where({url: opts.url}).toArray()
            );
        } else {
            return liveQuery(() => (db.highlights.toArray()));
        }
    }
};

export default HighlightInterface;

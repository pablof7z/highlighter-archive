import { get as getStore } from 'svelte/store';
import {ndk as ndkStore} from '../store';
import { liveQuery } from 'dexie';
import { db } from '$lib/interfaces/db.js';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import {nip19} from 'nostr-tools';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

interface ILoadOpts {
    pubkeys?: string[];
    articleNaddr?: string;
    url?: string;
    ids?: string[];
};

// until I add delete support
const blacklistIds = [
    'd7ecc7d8dd63ba0dbbcfcc209fc2d95359e516f39bcc783aabb466d8643ab960', // accidental highlight
];

const HighlightInterface = {
    fromIds: (ids: string[]) => {
        return liveQuery(() =>
            db.highlights.where('id').anyOf(ids).toArray()
        );
    },

    startStream: (opts: ILoadOpts = {}) => {
        let articleReference: string | undefined;
        const ndk: NDK = getStore(ndkStore);
        const filter: NDKFilter = { kinds: [9802] };
        const boostFilter: NDKFilter = { kinds: [6], '#k': ["9802"] };

        if (opts.pubkeys) {
            filter['authors'] = opts.pubkeys;
            boostFilter['authors'] = opts.pubkeys;
        }

        if (opts.ids) filter['ids'] = opts.ids;
        if (opts.articleNaddr) {
            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`
            filter['#a'] = [articleReference];
        }

        if (opts.url) filter['#r'] = [opts.url];

        const subs = ndk.subscribe(filter, { closeOnEose: false });
        const boostSubs = ndk.subscribe(boostFilter, { closeOnEose: false });

        subs.on('event', eventHandler);
        boostSubs.on('event', eventHandler);

        return [subs, boostSubs];
    },

    load: (opts: ILoadOpts = {}) => {
        if (opts.pubkeys) {
            return liveQuery(() =>
                db.highlights
                    .where('pubkey').anyOf(opts.pubkeys as string[])
                    .or('boostedBy').anyOf(opts.pubkeys as string[])
                    .toArray()
            );
        } else if (opts.articleNaddr) {
            let articleReference: string | undefined;

            const ndecode = nip19.decode(opts.articleNaddr).data as any;
            articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`

            return liveQuery(() =>
                db.highlights.where({articleId: articleReference}).toArray()
            );
        } else if (opts.url) {
            return liveQuery(() =>
                db.highlights.where({url: opts.url}).toArray()
            );
        } else if (opts.ids) {
            return liveQuery(() =>
                db.highlights.where('id').anyOf(opts.ids!).toArray()
            );
        } else {
            return liveQuery(() => (db.highlights.toArray()));
        }
    }
};

async function eventHandler(event: NDKEvent) {
    let highlight;

    if (blacklistIds.includes(event.id)) return;

    try {
        switch (event.kind) {
            case 6: highlight = await handleEvent6(event); break;
            case 9802: highlight = await handleEvent9802(event); break;
        }

        if (highlight) db.highlights.put(highlight);

    } catch (e) {
        console.error(e);
    }
}

async function handleEvent6(event: NDKEvent) {
    const boostedEventJson = JSON.parse(event.content);
    const boostedEvent = new NDKEvent(event.ndk, boostedEventJson);

    const highlight = await handleEvent9802(boostedEvent);
    if (!highlight) return;

    highlight.boostedBy = event.pubkey;
    highlight.id = event.id;

    return highlight;
}

export async function handleEvent9802(event: NDKEvent) {
    const articleId = valueFromTag(event, 'a');
    const url = valueFromTag(event, 'r');

    if (!url) return;

    const highlight: App.Highlight = {
        id: event.tagId(),
        url,
        pubkey: event.pubkey,
        content: event.content,
        articleId,
        timestamp: event.created_at || Math.floor(Date.now() / 1000),
        event: JSON.stringify(await event.toNostrEvent())
    };

    return highlight;
}

export default HighlightInterface;

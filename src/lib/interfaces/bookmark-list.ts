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
    naddr?: string;
    decodedNaddrs?: string[];
};

const BookmarkListInterface = {
    startStream: (opts: ILoadOpts = {}) => {
        const ndk: NDK = getStore(ndkStore);
        const filter: NDKFilter = { kinds: [30000, 30001] };

        if (opts.pubkeys) {
            filter['authors'] = opts.pubkeys;
        }
        if (opts.naddr) {
            const decode = nip19.decode(opts.naddr).data as any;
            filter['kinds'] = [decode.kind];
            filter['#d'] = [decode.identifier];
            filter['authors'] = [decode.pubkey];
        }

        const subs = ndk.subscribe(filter, { closeOnEose: false });

        subs.on('event', eventHandler);

        return [subs];
    },

    load: (opts: ILoadOpts = {}) => {
        if (opts.pubkeys) {
            return liveQuery(() =>
                db.bookmarkLists
                    .where('pubkey').anyOf(opts.pubkeys as string[])
                    .toArray()
            );
        } else if (opts.naddr) {
            const decode = nip19.decode(opts.naddr).data as any;
            const queryId = `${decode.kind}:${decode.pubkey}:${decode.identifier}`;
            return liveQuery(() =>
                db.bookmarkLists
                    .where({id: queryId})
                    .toArray()
            );
        } else if (opts.decodedNaddrs) {
            return liveQuery(() =>
                db.bookmarkLists
                    .where('id').anyOf(opts.decodedNaddrs)
                    .toArray()
            );
        }
    }
};

async function eventHandler(event: NDKEvent) {
    let bookmarkList;

    try {
        switch (event.kind) {
            case 30000: bookmarkList = await handleEvent30001(event); break;
            case 30001: bookmarkList = await handleEvent30001(event); break;
        }

        if (bookmarkList) db.bookmarkLists.put(bookmarkList);

    } catch (e) {
        console.error(e);
    }
}

async function handleEvent30001(event: NDKEvent) {
    const title = event.getMatchingTags('d')[0][1];
    const descriptionTag = event.getMatchingTags('description')[0];
    const description = descriptionTag ? descriptionTag[1] : '';

    const bookmarkList: App.BookmarkList = {
        id: event.tagId(),
        pubkey: event.pubkey,
        createdAt: event.created_at!,
        naddr: event.encode(),
        title,
        description,
        event: JSON.stringify(event.rawEvent())
    };

    return bookmarkList;
}

export default BookmarkListInterface;
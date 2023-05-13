import { get as getStore } from 'svelte/store';
import ndkStore from '../stores/ndk';
import Dexie, { liveQuery, type Observable } from 'dexie';
import { db } from '$lib/interfaces/db.js';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import {nip19} from 'nostr-tools';
import { browser } from '$app/environment';
import { idFromNaddr } from '$lib/utils';

function valueFromTag(event: NDKEvent, tag: string): string | undefined {
    const matchingTag = event.tags.find((t: string[]) => t[0] === tag);

    if (matchingTag) return matchingTag[1];
}

export interface ILoadOpts {
    sortBy?: string;
    articleId?: string;
    pubkeys?: string[];
    url?: string;
    ids?: string[];
    limit?: number;
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
        console.log(`starting highlight stream with opts: ${JSON.stringify(opts)}`);
        let articleReference: string | undefined;
        const ndk: NDK = getStore(ndkStore);
        const filter: NDKFilter = { kinds: [9802] };
        // const boostFilter: NDKFilter = { kinds: [6], '#k': ["9802"], since: 100000000 };

        if (opts.pubkeys) {
            filter['authors'] = opts.pubkeys;
            // boostFilter['authors'] = opts.pubkeys;
        }

        if (opts.ids) filter['ids'] = opts.ids;
        if (opts.articleId) {
            filter['#a'] = [opts.articleId];
        }

        if (opts.url) filter['#r'] = [opts.url];

        if (opts.limit) {
            filter['limit'] = opts.limit;
            // boostFilter['limit'] = opts.limit;
        }

        const subs = ndk.subscribe(filter, { closeOnEose: false });
        // const boostSubs = ndk.subscribe(boostFilter, { closeOnEose: false });

        subs.on('event', eventHandler);
        // boostSubs.on('event', eventHandler);

        // return [subs, boostSubs];
        return [subs];
    },

    loadByArticleIdAndPubkeys(articleId: string, pubkeys: string[] | undefined, opts?: ILoadOpts): Observable<App.Highlight[]> {
        return liveQuery(() =>
            db.highlights.where({articleId})
                .and((highlight: App.Highlight) => pubkeys ? pubkeys.includes(highlight.pubkey) : true)
                .limit(opts?.limit || 100)
                .reverse()
                .sortBy(opts?.sortBy || 'timestamp')
        );
    },


    load: (opts: ILoadOpts = {}): Observable<App.Highlight[]> => {
        console.log(`requesting highlights`, opts)

        if (!browser) return liveQuery(() => Promise.resolve([]) );

        let query: Dexie.Collection<App.Highlight, string> = db.highlights.orderBy('timestamp').reverse();

        const filters = {
            highlightOrRepostBy: (pubkeys: string[]) => {
                return (h: App.Highlight) => {
                    const pubkeyIsInPubkeys = pubkeys.includes(h.pubkey);
                    const boostedByIsInPubkeys = h.boostedBy && pubkeys!.includes(h.boostedBy);

                    const ret = !!(pubkeyIsInPubkeys || boostedByIsInPubkeys);

                    if (ret) console.log(ret, pubkeys, h.pubkey, {  pubkeyIsInPubkeys,boostedByIsInPubkeys })

                    return ret;
                }
            },

            articleId: (articleId: string) => {
                return (h: App.Highlight) => h.articleId === articleId;
            }
        };

        if (opts.pubkeys && opts.articleId) {
            query = query.filter(filters.articleId(opts.articleId))
                .filter(filters.highlightOrRepostBy(opts.pubkeys));
        } else if (opts.pubkeys) {
            query = query.filter(filters.highlightOrRepostBy(opts.pubkeys));
        } else if (opts.articleId) {
            query = query.filter(h => h.articleId === opts.articleId);
        } else if (opts.ids) {
            query = query.filter(h => opts.ids!.includes(h.id!));
        } else if (opts.url) {
            query = query.filter(h => h.url === opts.url);
        }

        if (opts.limit) {
            query = query.limit(opts.limit);
        }

        return liveQuery(() => query.toArray());
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

export function handleEvent9802(event: NDKEvent) {
    const articleId = valueFromTag(event, 'a');
    const url = valueFromTag(event, 'r');
    const context = valueFromTag(event, 'context');

    const highlight: App.Highlight = {
        id: event.tagId(),
        url,
        pubkey: event.pubkey,
        content: event.content,
        context,
        articleId,
        timestamp: event.created_at || Math.floor(Date.now() / 1000),
        event: JSON.stringify(event.rawEvent())
    };

    return highlight;
}

export default HighlightInterface;

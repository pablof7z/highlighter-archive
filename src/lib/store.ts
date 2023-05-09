import { writable } from 'svelte/store';
import NDK, {NDKEvent, NDKUser} from '@nostr-dev-kit/ndk';
import type { NDKCacheAdapter, NDKFilter, NDKSubscription, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { db } from '$lib/interfaces/db';

// TOOD
function profileFromEvent(event: NDKEvent, profile: NDKUserProfile): NDKUserProfile {
    const payload = JSON.parse(event.content);

    if (payload.name) profile.name = payload.name;
    if (payload.display_name) profile.displayName = payload.display_name;
    if (payload.displayName) profile.displayName = payload.displayName;
    if (payload.image) profile.image = payload.image;
    if (payload.picture) profile.image = payload.picture;
    if (payload.banner) profile.banner = payload.banner;
    if (payload.bio) profile.bio = payload.bio;
    if (payload.nip05) profile.nip05 = payload.nip05;
    if (payload.lud06) profile.lud06 = payload.lud06;
    if (payload.lud16) profile.lud16 = payload.lud16;
    if (payload.about) profile.about = payload.about;
    if (payload.zapService) profile.zapService = payload.zapService;

    return profile;
}

export default class DexieAdapter implements NDKCacheAdapter {
    readonly locking = true;

    public async query(subscription: NDKSubscription): Promise<void> {
        // if filter's kinds is exactly [0] then we're looking for a user profile
        if (subscription.filter?.kinds?.length === 1 && subscription.filter.kinds[0] === 0) {
            for (const pubkey of (subscription.filter?.authors||[])) {
                const user = await db.users.where({ id: pubkey }).first();
                if (!user) continue;

                let userEvent;
                try {
                    userEvent = JSON.parse(user.event);
                } catch (e) {
                    // console.log('failed to parse user event', e);
                    continue;
                }

                const ndkEvent = new NDKEvent(undefined, userEvent);
                subscription.eventReceived(ndkEvent, undefined, true);
            }
        }
    }

    public async setEvent(event: NDKEvent, filter: NDKFilter): Promise<void> {
        if (event.kind === 0) {
            let profile = profileFromEvent(event, {});

            db.users.put({
                id: event.pubkey,
                name: profile.name,
                displayName: profile.displayName,
                image: profile.image,
                banner: profile.banner,
                bio: profile.bio,
                nip05: profile.nip05,
                lud16: profile.lud16,
                about: profile.about,
                zapService: profile.zapService,
                event: JSON.stringify(event.rawEvent()),
            })
        }
    }
}

const dexieCacheAdaper = new DexieAdapter();

export const ndk = writable(new NDK({
    explicitRelayUrls: [
        'wss://purplepag.es',
        'ws://localhost:8080',
        'wss://nos.lol',
        'wss://relay.f7z.io',
        'wss://relay.damus.io',
        'wss://nostr.mom',
        'wss://nostr.terminus.money',
        'wss://atlas.nostr.land/',
        'wss://offchain.pub/'
    ],
    devWriteRelayUrls: [
        'ws://localhost:8080',
    ],
    cacheAdapter: dexieCacheAdaper,
}));

export const currentUser = writable<NDKUser | null>(null);
export const currentUserFollowPubkeys = writable<string[] | undefined>(undefined);
export const backgroundBanner = writable<string | null>(null);

let zapEvent: any;

export const zap = writable(zapEvent);
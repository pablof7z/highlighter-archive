import { get as getStore } from 'svelte/store';
import {ndk as ndkStore} from '$lib/store';
import type { GetUserParams, NDKFilterOptions } from '@nostr-dev-kit/ndk';
import { liveQuery, type Observable } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/interfaces/db';

const UserInterface = {
    get: (opts: GetUserParams): Observable<App.UserProfile> => {
        // const users = db.users.where({ id: user.hexpubkey() }).first()

        const ndk = getStore(ndkStore);
        const user = ndk.getUser(opts);
        let userProfile: App.UserProfile = { event: '', ...(user.profile || {}), id: user.hexpubkey() };

        user.fetchProfile({ groupableDelay: 1000 } as NDKFilterOptions).then(async (events) => {
            userProfile = { ...userProfile, ...(user.profile || {}) };
            if (events && events.size > 0) userProfile.event = JSON.stringify(Array.from(events)[0].rawEvent());
            await db.users.put(userProfile);
        });

        return liveQuery(() =>
            browser ? db.users.where({ id: user.hexpubkey() }).first() || userProfile : userProfile
        ) as Observable<App.UserProfile>;
    }
};

export default UserInterface;

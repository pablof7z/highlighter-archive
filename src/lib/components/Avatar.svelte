<script lang="ts">
    import UserInterface from '$lib/interfaces/users';
    import type { Observable } from 'dexie';

    export let pubkey: string | undefined = undefined;
    export let userProfile: App.UserProfile | undefined = undefined;
    export let klass: string = '';
    let prevPubkey: string | undefined = undefined;

    let defaultImage = `https://robohash.org/${pubkey?.slice(0, 1)}`;

    let observeUserProfile: Observable<App.UserProfile> | undefined = undefined;
    let image: string | undefined = userProfile?.image;

    $: {
        if (pubkey !== prevPubkey && !userProfile) {
            prevPubkey = pubkey;
            observeUserProfile = UserInterface.get({ hexpubkey: pubkey });
        }

        if (observeUserProfile && $observeUserProfile) {
            userProfile = ($observeUserProfile||{}) as App.UserProfile;
        }

        defaultImage = `https://robohash.org/${pubkey?.slice(0, 1)}`;
        image = userProfile?.image || defaultImage;
    }
</script>

{#await observeUserProfile}
    <img src={defaultImage} class={`rounded-full ${klass}`} />
{:then _userProfile}
    <img src={image || defaultImage} class={`rounded-full ${klass}`} />
{:catch error}
    <span class="rounded-full w-6 h-6 text-red-600">E</span>
{/await}
<script lang="ts">
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import UserInterface from '$lib/interfaces/users';
    import type { Observable } from 'dexie';
    import CardContent from '$lib/components/events/content.svelte';

    export let pubkey: string | undefined;
    export let userProfile: App.UserProfile | undefined = undefined;
    export let subtitle: string | undefined = undefined;
    let prevPubkey: string | undefined = undefined;
    let observeUserProfile: Observable<App.UserProfile> | undefined = undefined;

    $: {
        if (pubkey !== prevPubkey && !userProfile) {
            prevPubkey = pubkey;
            observeUserProfile = UserInterface.get({ hexpubkey: pubkey });
        }

        if (observeUserProfile && $observeUserProfile) {
            userProfile = ($observeUserProfile||{}) as App.UserProfile;
        }
    }
</script>

<div class="
    flex flex-row items-center justify-between gap-12 p-6
    overflow-hidden
    bg-black/80
    rounded-xl
" >
    <div class="flex flex-row gap-6">
        <Avatar {userProfile} klass="w-28 h-28" />

        <div class="flex flex-col gap-4 text-white">
            <div class="text-2xl font-semibold whitespace-nowrap w-42 truncate">
                <Name {userProfile} />
            </div>

            {#if subtitle}
                <div class="text-sm text-gray-500">
                    {subtitle}
                </div>
            {/if}

            <div class="text-zinc-400 text-sm whitespace-normal">
                {#if userProfile?.about}
                    <CardContent note={userProfile?.about||''} tags={[]} />
                {/if}
            </div>
        </div>
    </div>
</div>
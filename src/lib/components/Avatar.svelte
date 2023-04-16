<script lang="ts">
    import { Avatar, Tooltip } from 'flowbite-svelte';
    import UserInterface from '$lib/interfaces/users';

    export let userProfile: App.UserProfile;
    export let klass: string | undefined;

    const id = userProfile.id;
    let _userProfile = userProfile;
    let image: string | undefined;
    let defaultImage = `https://robohash.org/${userProfile.id?.slice(0, 1)}`;

    let observeUserProfile;

    if (!_userProfile?.image) {
        observeUserProfile = UserInterface.get({ hexpubkey: _userProfile.id });
    }

    $: {
        _userProfile = $observeUserProfile! as App.UserProfile;
        image = _userProfile?.image;
    }
</script>

<img src={image || defaultImage} class={`rounded-full ${klass}`} />
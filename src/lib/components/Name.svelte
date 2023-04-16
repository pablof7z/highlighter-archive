<script lang="ts">
    import UserInterface from '$lib/interfaces/users';

    export let userProfile: App.UserProfile;

    const id = userProfile.id;
    let _userProfile = userProfile;
    let name: string | undefined;
    let defaultName = `[${userProfile.id?.slice(0, 5)}]`;

    let observeUserProfile;

    if (!_userProfile?.displayName) {
        observeUserProfile = UserInterface.get({ hexpubkey: _userProfile.id });
    }

    $: {
        _userProfile = $observeUserProfile! as App.UserProfile;
        name = _userProfile?.displayName || defaultName;
    }
</script>

{name}
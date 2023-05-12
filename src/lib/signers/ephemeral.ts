import NDK, { NDKEvent, NDKPrivateKeySigner, type NDKFilter, type NDKSigner, type NDKUserProfile } from "@nostr-dev-kit/ndk";
import type { NDKTag, NostrEvent } from "@nostr-dev-kit/ndk/lib/src/events";
import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'

const CURRENT_PRIVATE_NOTE_VERSION = '2';

interface IFindEphemeralSignerLookups {
    name?: string;
    associatedEventNip19?: string;
}

/**
 * Finds a named ephemeral signer from a self-DM.
 */
export async function findEphemeralSigner(
    ndk: NDK,
    mainSigner: NDKSigner,
    opts: IFindEphemeralSignerLookups
): Promise<NDKPrivateKeySigner | undefined> {
    const mainUser = await mainSigner.user();
    const filter: NDKFilter = {kinds:[4], '#p': [mainUser.hexpubkey()]};

    if (opts.name) {
        const hashedName = await getHashedKeyName(opts.name);
        filter["#e"] = [hashedName];
    } else if (opts.associatedEventNip19) {
        const hashedEventReference = await getHashedKeyName(opts.associatedEventNip19);
        filter["#e"] = [hashedEventReference];
    }

    const event = await ndk.fetchEvent(filter);

    if (event) {
        await event.decrypt(await mainSigner.user());
        console.log(`decrypted`, event.content);
        const content = JSON.parse(event.content);
        return new NDKPrivateKeySigner(content.key);
    }
}

type EphemeralKeyEventContent = {
    key: string;
    event?: string;
    version: string;
    metadata?: object;
}

interface ISaveOpts {
    associatedEvent?: NDKEvent;
    name?: string;
    metadata?: object;
    keyProfile?: NDKUserProfile;
    mainSigner?: NDKSigner;
}

function generateContent(targetSigner: NDKPrivateKeySigner, opts: ISaveOpts = {}) {
    const content: EphemeralKeyEventContent = {
        key: targetSigner.privateKey!,
        version: CURRENT_PRIVATE_NOTE_VERSION,
        ...opts.metadata
    }

    if (opts.associatedEvent) content.event = opts.associatedEvent.encode();

    return JSON.stringify(content);
}

async function getHashedKeyName(name: string) {
    let eventHash = sha256(name);
    return bytesToHex(eventHash);
}

async function generateTags(mainSigner: NDKSigner, opts: ISaveOpts = {}) {
    const mainUser = await mainSigner.user();
    const tags = [
        ['p', mainUser.hexpubkey() ],
        ['client', 'atlas']
    ];

    if (opts.associatedEvent) {
        // TODO: This is trivially reversable; better to encrypt it or hash it with the hexpubkey
        const hashedEventReference = await getHashedKeyName(opts.associatedEvent.encode());
        tags.push(['e', hashedEventReference]);
    }

    if (opts.name) {
        const hashedName = await getHashedKeyName(opts.name);
        tags.push(['e', hashedName]);
    }

    return tags;
}

/**
 * Saves an ephemeral signer to a self-DM
 *
 * @param ndk The NDK instance to use
 * @param mainSigner The signer to save the ephemeral signer with
 * @param targetSigner The ephemeral signer to save
 * @param associatedEvent An event to associate with the ephemeral signer
 * @param name The name to save the ephemeral signer as -- this name will be encrypted with the main signer's public key
 */
export async function saveEphemeralSigner(
    ndk: NDK,
    targetSigner: NDKPrivateKeySigner,
    opts: ISaveOpts = {}
) {
    const mainSigner = opts.mainSigner || ndk.signer;

    if (!mainSigner) throw new Error('No main signer provided');

    const mainUser = await mainSigner.user();
    const event = new NDKEvent(ndk, {
        kind: 4,
        content: generateContent(targetSigner, opts),
        tags: await generateTags(mainSigner, opts)
    } as NostrEvent);
    event.pubkey = mainUser.hexpubkey();
    await event.encrypt(mainUser, mainSigner);
    // await event.sign(mainSigner);
    await event.publish();

    // XXX Extract this to NDK
    if (opts.keyProfile) {
        const user = await targetSigner.user();
        const event = new NDKEvent(ndk, {
            kind: 0,
            content: JSON.stringify(opts.keyProfile),
            tags: [] as NDKTag[]
        } as NostrEvent)
        event.pubkey = user.hexpubkey();
        await event.sign(targetSigner);
        await event.publish();
    }
}

export function generateEphemeralSigner(): NDKPrivateKeySigner {
    const signer = NDKPrivateKeySigner.generate();
    console.log('generateEphemeralSigner', signer.privateKey);
    return signer;
}

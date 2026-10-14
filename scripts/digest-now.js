// Posts the current-status summary to Chat right away (reads data/state.json).
import { config, allAccounts } from '../src/config.js';
import { Store } from '../src/store.js';
import { buildDigest } from '../src/digest.js';
import { sendToChat } from '../src/chat.js';

const store = new Store();
await sendToChat(buildDigest(store, allAccounts(), config));
console.log('Digest posted.');

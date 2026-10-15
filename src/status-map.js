// Every store state → { emoji, label, category }.
// Categories drive the dashboard and the digest:
//   none | draft | submitted | in_review | approved | live | rejected | action | removed | testing

const S = (emoji, label, category) => ({ emoji, label, category });

export const APP_STORE = {
  PREPARE_FOR_SUBMISSION: S('📝', 'Prepare for submission', 'draft'),
  DEVELOPER_REJECTED: S('↩️', 'Removed from review', 'draft'),
  READY_FOR_REVIEW: S('📤', 'Ready for review', 'submitted'),
  WAITING_FOR_REVIEW: S('📤', 'Sent for review', 'submitted'),
  WAITING_FOR_EXPORT_COMPLIANCE: S('⚠️', 'Waiting for export compliance', 'action'),
  IN_REVIEW: S('🔍', 'In review', 'in_review'),
  PENDING_DEVELOPER_RELEASE: S('✅', 'Approved – pending your release', 'approved'),
  PENDING_APPLE_RELEASE: S('✅', 'Approved – Apple releasing', 'approved'),
  ACCEPTED: S('✅', 'Approved', 'approved'),
  PROCESSING_FOR_DISTRIBUTION: S('⚙️', 'Processing for distribution', 'approved'),
  PROCESSING_FOR_APP_STORE: S('⚙️', 'Processing for App Store', 'approved'),
  READY_FOR_DISTRIBUTION: S('🚀', 'Live', 'live'),
  READY_FOR_SALE: S('🚀', 'Live', 'live'),
  REPLACED_WITH_NEW_VERSION: S('🔁', 'Replaced with new version', 'live'),
  REJECTED: S('❌', 'Rejected', 'rejected'),
  METADATA_REJECTED: S('❌', 'Metadata rejected', 'rejected'),
  INVALID_BINARY: S('❌', 'Invalid binary', 'rejected'),
  DEVELOPER_REMOVED_FROM_SALE: S('⛔', 'Removed from sale', 'removed'),
  REMOVED_FROM_SALE: S('⛔', 'Removed from sale', 'removed'),
  NOT_APPLICABLE: S('·', 'Not applicable', 'none'),
};

export const TESTFLIGHT = {
  WAITING_FOR_REVIEW: S('⏳', 'Waiting for beta review', 'submitted'),
  IN_REVIEW: S('🔍', 'In beta review', 'in_review'),
  APPROVED: S('✅', 'Beta approved', 'live'),
  REJECTED: S('❌', 'Beta rejected', 'rejected'),
  PROCESSING_FAILED: S('⚙️', 'Processing failed', 'action'),
  PROCESSING: S('⚙️', 'Processing build', 'draft'),
  READY_FOR_BETA_SUBMISSION: S('📝', 'Ready for beta submission', 'draft'),
  INTERNAL_ONLY: S('🧪', 'Internal testing', 'testing'),
};

export const PLAY = {
  SENT_FOR_REVIEW: S('📤', 'Release sent to Google', 'submitted'),
  IN_REVIEW: S('🔍', 'In review', 'in_review'),
  APPROVED: S('✅', 'Approved', 'approved'),
  READY_TO_PUBLISH: S('✅', 'Ready to publish (managed publishing)', 'approved'),
  LIVE: S('🚀', 'Live', 'live'),
  ROLLOUT: S('📈', 'Staged rollout', 'live'),
  HALTED: S('⏸️', 'Rollout halted', 'action'),
  DRAFT: S('📝', 'Draft release', 'draft'),
  REJECTED: S('❌', 'Rejected', 'rejected'),
  REMOVED: S('⛔', 'Removed / suspended', 'removed'),
  POLICY_ACTION: S('⚠️', 'Policy action required', 'action'),
};

const UNKNOWN = (status) => S('❔', String(status || 'Unknown').replace(/_/g, ' ').toLowerCase(), 'none');

export function describe(store, channel, status) {
  if (!status) return S('·', 'No submission', 'none');
  const table = store === 'apple' ? (channel === 'testflight' ? TESTFLIGHT : APP_STORE) : PLAY;
  return table[status] || UNKNOWN(status);
}

export const CATEGORY_ORDER = ['in_review', 'submitted', 'rejected', 'action', 'approved', 'removed', 'draft', 'testing', 'live', 'none'];

export const CHANNEL_LABELS = {
  appstore: 'App Store',
  testflight: 'TestFlight',
  production: 'Production',
  beta: 'Open testing',
  alpha: 'Closed testing',
  internal: 'Internal testing',
};

export const channelLabel = (ch) => CHANNEL_LABELS[ch] || (ch ? `Track: ${ch}` : '');

/** Statuses for which "time since submission" should keep counting. */
export const isPending = (category) => category === 'submitted' || category === 'in_review';
/** Statuses that end a review cycle. */
export const isTerminal = (category) => ['approved', 'live', 'rejected', 'removed'].includes(category);

// Public release channels: the only ones shown on the dashboard and posted to Chat.
// TestFlight and Play testing tracks (beta = open, alpha = closed, internal) are ignored.
export const RELEASE_CHANNELS = new Set(['appstore', 'production']);

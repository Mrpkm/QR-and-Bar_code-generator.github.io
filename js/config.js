/* Cloud configuration. Leave both values empty to run in local-only mode:
 * the generators and guest analytics keep working, and all cloud UI
 * (accounts, community counter, scan tracking) hides itself.
 *
 * To enable cloud features, create a free Supabase project, run
 * supabase/migration.sql in its SQL editor, then paste the project URL and
 * the anon (public) key here. The anon key is safe to commit: it only grants
 * what the row-level-security policies in the migration allow.
 */
var CODESAFE_CONFIG = {
  SUPABASE_URL: "https://lnxssynctjafinwiwnhm.supabase.co",
  // Publishable API key (sb_publishable_...): safe to commit and ship — all
  // protection lives in the row-level-security policies (see supabase/migration.sql).
  SUPABASE_ANON_KEY: "sb_publishable_veKX3koYo14khCYmPRiV_w_QXSumvpG"
};

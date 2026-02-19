/**
 * Hocuspocus Database extension for Yjs snapshot persistence.
 * Fetches and stores board state in Supabase.
 */

import { Database } from '@hocuspocus/extension-database';

const getBoardId = (documentName) => documentName.replace('board-', '');

/**
 * Create the Database extension for Hocuspocus.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Database} Hocuspocus Database extension instance
 */
export function createDatabaseExtension(supabase) {
  return new Database({
    fetch: async ({ documentName }) => {
      const boardId = getBoardId(documentName);
      console.log(`📥 Fetching snapshot for board: ${boardId}`);

      try {
        const { data, error } = await supabase
          .from('board_snapshots')
          .select('state')
          .eq('board_id', boardId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            console.log(`   No snapshot found (new board)`);
            return null;
          }
          throw error;
        }

        if (!data?.state) return null;

        const bytes = Buffer.from(data.state, 'base64');
        console.log(`   Loaded ${bytes.length} bytes`);
        return bytes;
      } catch (err) {
        console.error('   Fetch failed:', err.message);
        return null;
      }
    },

    store: async ({ documentName, state }) => {
      const boardId = getBoardId(documentName);

      setImmediate(async () => {
        console.log(`📤 [Async] Storing snapshot for board: ${boardId} (${state.length} bytes)`);

        try {
          const base64 = Buffer.from(state).toString('base64');

          const { error } = await supabase.from('board_snapshots').insert({
            board_id: boardId,
            state: base64,
            created_by: null,
          });

          if (error) throw error;

          await supabase
            .from('boards')
            .update({ last_modified: new Date().toISOString() })
            .eq('id', boardId);

          console.log(`   ✅ Snapshot saved (${state.length} bytes)`);
        } catch (err) {
          console.error('   Store failed:', err.message);
        }
      });
    },
  });
}

-- claim_next_bulk_run_item: atomically picks the next pending item for a bulk
-- run using FOR UPDATE SKIP LOCKED so concurrent pollers don't double-process.
-- Returns a single-row table {id, client_id} or an empty set if nothing is pending.

CREATE OR REPLACE FUNCTION claim_next_bulk_run_item(p_run_id UUID)
RETURNS TABLE (id UUID, client_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id   UUID;
  v_client_id UUID;
BEGIN
  SELECT bri.id, bri.client_id
    INTO v_item_id, v_client_id
    FROM bulk_run_items bri
   WHERE bri.bulk_run_id = p_run_id
     AND bri.status      = 'pending'
   ORDER BY bri.id
   LIMIT 1
     FOR UPDATE SKIP LOCKED;

  IF v_item_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE bulk_run_items
     SET status     = 'in_progress',
         started_at = NOW()
   WHERE bulk_run_items.id = v_item_id;

  id        := v_item_id;
  client_id := v_client_id;
  RETURN NEXT;
END;
$$;

-- Grant execute to authenticated users (RLS on the underlying tables still applies)
GRANT EXECUTE ON FUNCTION claim_next_bulk_run_item(UUID) TO authenticated;

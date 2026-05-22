-- Fix trigger so is_default is only cleared when subject or body actually changes.
-- Required for reset-to-default server action (which must set is_default=TRUE
-- in a second UPDATE after restoring content).
CREATE OR REPLACE FUNCTION trigger_set_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.is_default = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

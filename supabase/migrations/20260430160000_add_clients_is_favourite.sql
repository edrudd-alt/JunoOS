-- Add a boolean to flag clients that should appear in the "Active investors"
-- tab of the Add Investors modal. Manually toggled by the team via a star
-- icon in the picker UI itself. Default false; can be set true on any client.

ALTER TABLE clients
  ADD COLUMN is_favourite BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clients.is_favourite IS
  'Marks the client as a regular favourite — appears in the "Active investors" tab of the Add Investors modal. Toggled manually via star icon.';

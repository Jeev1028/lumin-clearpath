-- Private bucket for files students attach in Lumin AI chat. Files are
-- uploaded straight from the browser (so they never pass through the
-- host's ~4.5MB request limit) and read back by the chat API using the
-- student's own token. Stored under "{user_id}/..." so each student can
-- only touch their own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own chat attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own chat attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own chat attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

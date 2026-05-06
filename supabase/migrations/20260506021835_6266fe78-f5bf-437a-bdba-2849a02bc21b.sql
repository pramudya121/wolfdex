-- Replace permissive WITH CHECK (true) with a real validation expression
DROP POLICY IF EXISTS tokens_public_insert ON public.launchpad_tokens;
CREATE POLICY tokens_public_insert ON public.launchpad_tokens
FOR INSERT TO public
WITH CHECK (
  address ~ '^0x[0-9a-fA-F]{40}$'
  AND char_length(name) BETWEEN 1 AND 64
  AND char_length(symbol) BETWEEN 1 AND 16
  AND symbol ~ '^[A-Za-z0-9]+$'
  AND decimals BETWEEN 0 AND 18
  AND (creator IS NULL OR creator ~ '^0x[0-9a-fA-F]{40}$')
  AND (logo_url IS NULL OR (char_length(logo_url) <= 500 AND logo_url ~* '^https://'))
);

-- Public bucket can still serve files via getPublicUrl without a SELECT policy.
-- Remove the broad listing policy so attackers can't enumerate uploaded files.
DROP POLICY IF EXISTS logos_public_read ON storage.objects;

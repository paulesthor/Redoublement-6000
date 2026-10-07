-- Fonction q() : le Worker envoie un lot de requêtes SQL (déjà paramétrées), exécuté dans UNE transaction.
-- Renvoie, pour chaque requête : { results: [lignes en JSON], changes: nombre de lignes touchées }.
-- Réservée à la clé « service_role » (celle du Worker) : jamais accessible depuis un navigateur.
CREATE OR REPLACE FUNCTION public.q(stmts jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  out jsonb := '[]'::jsonb; s jsonb; sql text; res jsonb; n bigint;
BEGIN
  FOR s IN SELECT value FROM jsonb_array_elements(stmts) LOOP
    sql := s->>'sql';
    IF sql ~* '^\s*(select|with|values)\M' THEN
      EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (' || sql || ') t' INTO res;
      n := jsonb_array_length(res);
    ELSIF sql ~* '\mreturning\M' THEN
      EXECUTE 'WITH t AS (' || sql || ') SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM t' INTO res;
      n := jsonb_array_length(res);
    ELSE
      EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT; res := '[]'::jsonb;
    END IF;
    out := out || jsonb_build_array(jsonb_build_object('results', res, 'changes', n));
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.q(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.q(jsonb) TO service_role;

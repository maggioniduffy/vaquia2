-- migrate:up
-- app.assert_company_writable() runs as the invoking role, so `authenticated` must be able to
-- execute company_writable(); revoking it (20261017195409) broke every tenant write.
grant execute on function public.company_writable(uuid) to authenticated;

-- migrate:down
revoke execute on function public.company_writable(uuid) from authenticated;

FROM supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b
COPY experimental-workspace/accounts/start-auth.sh /start-auth.sh
ENTRYPOINT ["/bin/sh","/start-auth.sh"]

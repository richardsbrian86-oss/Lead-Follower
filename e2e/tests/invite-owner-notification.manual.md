# Manual test: owner notification after invite acceptance

This smoke test covers the server-side part of staff invite acceptance that
cannot be isolated by the browser-only invite tests: `POST
/api/auth/consume-invite` sends the owner an email through Resend.

Run it against the development API with a Clerk session for the staff user.
Use unique email addresses and a gym created only for this test.

## 1. Successful notification

1. Create a test owner and gym, then create a pending invite for a different
   test email. The relevant database shape is:

   ```sql
   INSERT INTO gyms (name, slug)
   VALUES ('Owner notification smoke gym', '<unique-slug>')
   RETURNING id;

   INSERT INTO users (email, name, role, gym_id)
   VALUES ('<owner-email>', 'Notification Owner', 'owner', '<gym-id>')
   RETURNING id;

   INSERT INTO invites
     (gym_id, email, token, expires_at, invited_by_user_id)
   VALUES
     ('<gym-id>', '<staff-email>', '<random-token>',
      now() + interval '48 hours', '<owner-id>');
   ```

   Keep the returned token, gym id, and owner email for the remaining steps.
2. Create/sign in to the Clerk user whose email is exactly `<staff-email>`.
   The session must be authenticated as the invitee, not the owner.
3. Call the endpoint with that session cookie:

   ```bash
   curl -i -X POST "$API_ORIGIN/api/auth/consume-invite" \
     -H 'Content-Type: application/json' \
     -H 'Cookie: <authenticated-staff-session-cookie>' \
     --data '{"token":"<random-token>"}'
   ```

   Expected response: HTTP `200` with `{"gymId":"<gym-id>"}`.
4. In the Resend dashboard, open the email activity created immediately after
   the request. Verify all of the following:

   - **To** is exactly `<owner-email>`, not `<staff-email>`.
   - The subject contains `<staff-email>` and `Owner notification smoke gym`.
   - The HTML/body contains both `<staff-email>` and `Owner notification smoke gym`.
5. Query the database and confirm the invite is accepted and the staff member
   is attached to the gym:

   ```sql
   SELECT accepted_at FROM invites WHERE token = '<random-token>';
   SELECT email, role, gym_id FROM users WHERE email = '<staff-email>';
   ```

   `accepted_at` must be non-null and the user row must have role `staff` and
   gym id `<gym-id>`.

The API responds before the email send completes by design. Wait for the
Resend activity to appear before deciding that delivery failed.

## 2. No owner found

1. Create a second gym and pending invite using a valid `invited_by_user_id`,
   but ensure no user with `role = 'owner'` has that gym id. A staff inviter is
   sufficient for this fixture.
2. Authenticate as the invitee and call the same endpoint with the second
   token.
3. Expect HTTP `200` with the second gym id. Confirm the invite is accepted,
   confirm the invitee is attached to the gym, and confirm **no Resend email
   activity** was created for this request.

This confirms that an absent owner is skipped safely rather than causing an
unhandled rejection or a failed invite acceptance response.

## 3. Resend send failure

1. Create a third normal owner/gym/invite fixture.
2. In a development-only server process, temporarily make Resend fail (for
   example, run with an intentionally invalid test-only `RESEND_API_KEY`).
   Do not change or expose a shared workspace secret. Restart the API so the
   process uses the temporary value.
3. Authenticate as the invitee and call the endpoint with the third token.
4. Expect HTTP `200` with the third gym id. Confirm the invite is accepted and
   the staff user is attached to the gym.
5. Check API logs for:

   ```
   [invite-accepted] failed to send owner notification:
   ```

   There must be no unhandled-rejection crash and no 5xx response from the
   consume endpoint. Restore the normal Resend configuration and restart the
   API when finished.

## Cleanup

Delete the three test gyms, their users, and their invites after the checks.
Do not use a shared/default gym or real email addresses.
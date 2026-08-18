# Templates

Standalone invitation experiences, kept out of the live site.

- `chat/` — iMessage-style lock screen + chat thread invitation
- `unfolding/` — unfolding letter / scroll invitation

They are **not deployed**: `.vercelignore` excludes this folder, and nothing in the
main site links to them. `/chat` and `/unfolding` are 404 on the live invite.

## Reusing for another client

1. Copy the template folder into the new project (any path — CSS/JS are referenced
   relatively, so the folder works wherever it is mounted).
2. Provide the shared assets it expects at the **site root**:
   - `/audio/wedding-music.mp3`
   - `/images/...` — see the `src` attributes in `index.html` for the exact list
     (avatars, `photo-1..3.jpg`, stickers).
3. Edit the copy: names, dates, venue, message text, and image filenames.

## Previewing locally

Serve the repo root and open the folder directly — the absolute `/images` and
`/audio` paths resolve against the root:

```
python3 -m http.server 8765
# http://localhost:8765/templates/chat/
# http://localhost:8765/templates/unfolding/
```

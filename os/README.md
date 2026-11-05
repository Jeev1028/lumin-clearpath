# Lumin OS (live ISO)

Debian 12 + Openbox + the Lumin desktop shell (dock, launcher, files, Memory, Home AI),
logging straight into Lumin. Built by the **Lumin OS ISO** GitHub Action; download it from
the `lumin-os-v*` release.

**Status: experimental. CI builds it, but it has not been boot-tested yet.**

## Try it in VirtualBox

1. New VM: Type Linux, Version Debian (64-bit), 4 GB RAM, 2+ CPUs, **no hard disk needed**.
2. Settings -> Display: Video Memory 128 MB, Graphics Controller **VMSVGA**.
3. Settings -> Storage: put `lumin-os.iso` in the optical drive. Start.
4. It signs in automatically as `lumin` and opens the desktop. Then sign in to Lumin.

Live mode keeps nothing after shutdown. Use Memory/Home AI settings each boot, or add a
persistent disk later.

## Boot on a real PC

Write the ISO to a USB stick with Rufus (DD mode) or balenaEtcher and boot from it.
Try it in a VM first.

## Keys

Ctrl+Space apps, Ctrl+Shift+L open Lumin, Ctrl+Alt+Shift+E leave the session.

## Rebuild

Actions -> Lumin OS ISO -> Run workflow. Shell code is shared with `windows/`
(`linux/prepare.mjs` copies it).

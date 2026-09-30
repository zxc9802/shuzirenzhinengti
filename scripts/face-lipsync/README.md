# VEED face workflow

New VEED video tasks use the source-resolution face workflow. Other providers,
MP3-only tasks and recovery of tasks created before this version retain their
existing processing. There is no automatic paid regeneration.

1. Prepare the full-frame 30 fps base as before. Independently track the face in
   the original, autorotated source; crop before reducing resolution. Reject
   missing/multiple faces, cuts and insufficient native resolution before a
   provider job is submitted.
2. Use one stable square crop containing the tracked face. Prepend 0.6 seconds
   of cloned video/silent PCM and append 0.3 seconds. Narration samples and speed
   are preserved. Store native crop coordinates, per-frame mouth positions and
   frame timing in `face-manifest.json`.
3. Send the prepared face crop and padded audio through the existing VEED
   adapter. Keep the full-frame base, original voice and manifest in job storage
   and private COS before paid submission so recovery can reconstruct the frame.
4. Compare background motion to establish one fixed frame offset. Remove the
   leading context and composite a feathered mouth region into the original
   frame. Reject unstable frame correspondence; never retime individual frames.
5. Measure AV alignment in overlapping speech windows using SyncNet. A reliable
   consistent offset may move the audio or pad the video start; original speech
   is never trimmed or accelerated. Measure the encoded candidate again before
   renaming it to `final.mp4`. Low confidence, inconsistent section offsets or
   processing failures leave the task failed and its provider identity intact.

The score is an engineering check, not a guarantee of perceptual quality. It
requires at least 1.2 seconds of narration and has 40 ms temporal resolution,
a +/-200 ms search range and a confidence floor
of 3. These conservative limits are validated on the reported short sample;
larger poses, occlusion, different voices and long/chunked clips need further
acceptance footage. Existing 90-second provider chunking is unchanged; padding
is applied to the utterance, not separately to every provider chunk.

## Runtime

Production Docker installs CPU PyTorch 2.6.0, the pinned Python requirements and
checksum-verified model files. No model download occurs in a user task. Worker
invocations are serialized within a Node server process and stream frames to
bound memory. Python subprocesses have a 30-minute timeout.

For a local environment with Python 3.11/3.12 and FFmpeg:

```sh
python3 -m venv .runtime/lipsync
.runtime/lipsync/bin/pip install torch==2.6.0 -r scripts/face-lipsync/requirements.txt
.runtime/lipsync/bin/python scripts/face-lipsync/download_models.py .runtime/lipsync-models
export LIPSYNC_PYTHON="$PWD/.runtime/lipsync/bin/python"
export LIPSYNC_MODEL_DIR="$PWD/.runtime/lipsync-models"
```

On Linux, install the CPU-specific wheel using the same command as the
Dockerfile to avoid pulling GPU dependencies. A missing runtime fails before
paid submission; there is no silent fallback to full-frame VEED input.

## Checks

```sh
npm test
npm run build
"$LIPSYNC_PYTHON" scripts/face-lipsync/test_worker.py
```

`tests/pipeline-billing-runtime.test.mjs` checks that the actual pipeline uses
the original source for preparation, submits transformed inputs and finalizes
through compositing/alignment; failures cannot settle or expose a deliverable.
`tests/bug-regressions.test.mjs` checks padded-duration recovery, the shared
finalizer and preservation of existing provider work without resubmission.
Python checks cover native crop bounds, rejection of low-resolution input,
sample-exact PCM padding and constant versus locally inconsistent offsets.

To measure a private video without sending it to a provider, save a JSON file
with absolute `videoPath` and `audioPath` fields (both may point to the video),
then run `worker.py analyze /absolute/path/request.json`. The `align` operation
additionally accepts `jobDir` and `outputPath`. Reports are saved privately as
`face-sync-report.json`; user-facing errors omit technical provider details.

Model attribution and licenses are in [NOTICE.md](NOTICE.md).

## Recorded acceptance (2026-09-30)

One real VEED generation used the automatic crop from the reported 6.56-second
sample, the original 4K source and the unchanged 144,640-sample narration.
The calculated crop was 832 pixels at (786, 1226), reduced to 768 for the
provider. Fixed frame registration selected zero; AV calibration calculated a
20 ms audio delay. All six overlapping windows scored zero residual offset at
40 ms measurement resolution after encoding (confidence 4.23–8.41).
Decoded final audio correlated 0.99958 with the original after accounting for
that delay, with the complete narration retained; full video decoding passed.

The same candidate passed the production finalizer used by normal and recovered
tasks. The Linux CPU runtime passed seven worker tests; the application suite
passed 228 tests with one skipped, and the production build passed. This is one
sample acceptance, not coverage of every source/voice or provider chunk boundary.

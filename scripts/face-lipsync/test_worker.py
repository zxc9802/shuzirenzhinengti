import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch
import wave

import numpy as np
from worker import QualityError, choose_delay, crop_plan, pad_audio, frame_offset, prepare, composite


class FaceWorkflowTests(unittest.TestCase):
    def test_short_narration_fails_before_model_loading_or_paid_work(self):
        with self.assertRaises(QualityError) as caught:
            prepare({"jobDir": "/unused", "durationSeconds": 0.8})
        self.assertEqual(caught.exception.code, "LIPSYNC_INPUT_DURATION")

    def test_padding_keeps_every_original_pcm_sample(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / "voice.wav", Path(directory) / "padded.wav"
            pcm = np.arange(12345, dtype=np.int16).tobytes()
            with wave.open(str(source), "wb") as wav:
                wav.setparams((1, 2, 22050, 0, "NONE", "not compressed"))
                wav.writeframes(pcm)
            duration = pad_audio(source, target)
            with wave.open(str(target), "rb") as wav:
                result = wav.readframes(wav.getnframes())
            lead, tail = round(0.6 * 22050) * 2, round(0.3 * 22050) * 2
            self.assertEqual(result[:lead], bytes(lead))
            self.assertEqual(result[lead:-tail], pcm)
            self.assertEqual(result[-tail:], bytes(tail))
            self.assertEqual(duration, 12345 / 22050)

    def test_crop_uses_native_coordinates_and_contains_moving_face(self):
        data = np.array([[1000, 1400, 210, 260], [1070, 1410, 210, 260]], dtype=float)
        result = crop_plan({"width": 2160, "height": 3840}, data)
        self.assertEqual(result["outputSize"], 768)
        self.assertEqual(result["size"], 768)
        self.assertLessEqual(result["x"], 1000)
        self.assertGreaterEqual(result["x"] + result["size"], 1280)
        self.assertLessEqual(result["y"], 1400)
        self.assertGreaterEqual(result["y"] + result["size"], 1670)

    def test_small_native_face_is_not_made_valid_by_upscaling(self):
        with self.assertRaises(QualityError):
            crop_plan({"width": 2160, "height": 3840}, np.array([[1000, 1400, 40, 55]], dtype=float))

    def test_alignment_uses_measured_delay_in_either_direction(self):
        for value in [-120, 0, 80]:
            self.assertEqual(choose_delay([{"delayMs": value, "confidence": 5}] * 3), value)
        for low, high in [(-40, 0), (0, 40), (80, 120)]:
            rows = [{"delayMs": value, "confidence": 5} for value in [low, high, high]]
            self.assertEqual(choose_delay(rows), (low + high) / 2)

    def test_frame_registration_uses_one_offset_and_rejects_local_speed_changes(self):
        source = np.random.default_rng(7).uniform(0, 255, (100, 12, 32, 3)).astype(np.float32)
        for delay in [-2, 0, 1]:
            rendered = np.concatenate([np.repeat(source[:1], 18 + delay, axis=0), source, np.repeat(source[-1:], 9, axis=0)])
            self.assertEqual(frame_offset(source, rendered, 18), delay)
        warped = np.concatenate([np.repeat(source[:1], 18, axis=0), source[:50], source[52:], np.repeat(source[-1:], 11, axis=0)])
        with self.assertRaises(QualityError):
            frame_offset(source, warped, 18)

    def test_local_speed_mismatch_and_uncertain_match_are_not_global_offsets(self):
        for rows in [[], [{"delayMs": 0, "confidence": 1}],
                     [{"delayMs": 200, "confidence": 8}],
                     [{"delayMs": 0, "confidence": 5}, {"delayMs": 120, "confidence": 6}]]:
            with self.assertRaises(QualityError):
                choose_delay(rows)

    def test_composite_registers_against_exact_provider_input_not_rescaled_base(self):
        source = np.random.default_rng(9).uniform(0, 255, (60, 12, 32, 3)).astype(np.float32)
        tail = np.repeat(source[-1:], 9, axis=0)
        rendered = np.concatenate([np.repeat(source[:1], 18, axis=0), source, tail])
        reference = np.concatenate([source, tail])
        unrelated_base = np.roll(source, 12, axis=0)
        with tempfile.TemporaryDirectory() as directory:
            job = Path(directory)
            (job / "face-input.mp4").touch()
            (job / "face-manifest.json").write_text(json.dumps({"durationSeconds": 2,
                "source": {"width": 64, "height": 64}, "crop": {"x": 0, "y": 0, "size": 64}}))
            def decoded(file, *args, **kwargs):
                if Path(file).name == "face-input.mp4":
                    self.assertIn("trim=start_frame=18", kwargs["extra"])
                    return iter(reference)
                return iter(rendered if Path(file).name == "rendered.mp4" else unrelated_base)
            # Stop just before encoding; exercise the actual correspondence
            # check using decoded-frame fixtures without loading face models.
            with patch("worker.probe", return_value={"width": 64, "height": 64, "duration": 2.9}), \
                 patch("worker.frames", side_effect=decoded), \
                 patch("worker.sp.Popen", side_effect=RuntimeError("registration-passed")):
                with self.assertRaisesRegex(RuntimeError, "registration-passed"):
                    composite({"jobDir": str(job), "renderedPath": str(job / "rendered.mp4")})
            self.assertEqual(json.loads((job / "face-registration.json").read_text())["fixedFrameOffset"], 0)


if __name__ == "__main__":
    unittest.main()

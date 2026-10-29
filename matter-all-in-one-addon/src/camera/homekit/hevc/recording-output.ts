/** Additional output of the SAME input process; never opens a second reader. */
export function hevcRecordingOutput(
  hasAudio: boolean,
  fragmentLength = 4000,
): string[] {
  return [
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-tag:v",
    "hvc1",
    ...(hasAudio
      ? [
          "-map",
          "0:a:0",
          "-c:a",
          "aac",
          "-profile:a",
          "aac_low",
          "-ar",
          "48000",
          "-ac",
          "1",
        ]
      : ["-an"]),
    "-f",
    "mp4",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-frag_duration",
    String(fragmentLength * 1000),
    "pipe:3",
  ];
}

import { NextResponse } from "next/server";

// OpenAI TTS voices mapped to concierge personalities
// Each voice has a distinct character that matches the personality
const PERSONALITY_VOICES: Record<string, { voice: string; speed: number }> = {
  coral:      { voice: "nova",    speed: 1.0  },  // Warm, friendly female
  captain:    { voice: "onyx",    speed: 0.95 },  // Deep, authoritative male
  luxe:       { voice: "shimmer", speed: 0.95 },  // Refined, elegant female
  backpacker: { voice: "echo",    speed: 1.1  },  // Energetic, youthful male
  local:      { voice: "fable",   speed: 0.9  },  // Warm, expressive, storyteller
  party:      { voice: "alloy",   speed: 1.05 },  // Upbeat, energetic neutral
};

export async function POST(request: Request) {
  try {
    const { text, personality } = await request.json() as {
      text: string;
      personality?: string;
    };

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Limit text length to prevent abuse (roughly 2 min of speech)
    const trimmed = text.slice(0, 2000);

    // Clean text for speech — strip markdown, URLs, etc.
    const clean = trimmed
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/[#*_~`]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();

    if (!clean) {
      return NextResponse.json({ error: "No speakable text" }, { status: 400 });
    }

    const config = PERSONALITY_VOICES[personality || "coral"] || PERSONALITY_VOICES.coral;

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",           // Standard model — much faster for voice chat
        voice: config.voice,
        input: clean,
        speed: config.speed,
        response_format: "aac", // Modern codec, small + high quality, universal support
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI TTS error:", res.status, err);
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
    }

    // Buffer and return the audio
    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/aac",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("TTS API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

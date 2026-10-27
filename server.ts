import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// High payload limit for high-resolution photo uploads
app.use(express.json({ limit: '60mb' }));

// Server-side Gemini client with recommended telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * AI-powered precision outline detection endpoint using Gemini 3.8 Flash.
 * Analyzes photos to segment the primary subject and return accurate normalized polygon contours.
 */
app.post('/api/ai-detect-outline', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/png' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 payload' });
    }

    // Clean data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `You are a high-precision computer vision specialist in vectorization, subject segmentation, and die-cut outline detection.
Examine this image and detect the exact outer border silhouette contour of the primary subject.
The image may have a colorful, multi-colored, photographic, textured, or patterned background (e.g. wood tables, colored cloth, wallpaper, outdoor scenery, or gradient backdrops).
CRITICAL REQUIREMENTS:
1. Differentiate the primary foreground artwork or subject from any surrounding colorful background, reflections, surface shadows, or edges. Trace ONLY the foreground design's outer boundary.
2. The returned polygon MUST be a seamless, continuous, completely closed perimeter loop with ZERO gaps and NO line breakage.
3. The vertices must be strictly ordered in clockwise sequence around the perimeter so that connecting them forms a complete closed boundary.
4. Ignore all background surfaces (such as tables, desks, fabrics, room lighting, drop shadows, or background scenery).
5. Trace the outer boundary of the main subject closely and accurately.
6. Return normalized polygon vertices from 0 to 1000 (where 0,0 is top-left and 1000,1000 is bottom-right).
7. Provide a detailed, smooth polygon loop with sufficient points (between 60 and 200 points) to accurately capture every contour and curve.
8. If the subject has any distinct internal cutout holes (such as a handle or leaf fenestration), include them as separate closed contours with isHole: true.`;

    let response;
    try {
      // Use Gemini 3.8 Flash for precision vision outline segmentation
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subjectName: {
                type: Type.STRING,
                description: 'Name or brief description of the detected subject',
              },
              contours: {
                type: Type.ARRAY,
                description: 'List of closed polygon loops defining the outline',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    isHole: {
                      type: Type.BOOLEAN,
                      description: 'True if this polygon represents an internal hole',
                    },
                    points: {
                      type: Type.ARRAY,
                      description: 'Sequential polygon points forming a closed loop',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          x: {
                            type: Type.NUMBER,
                            description: 'X coordinate from 0 to 1000',
                          },
                          y: {
                            type: Type.NUMBER,
                            description: 'Y coordinate from 0 to 1000',
                          },
                        },
                        required: ['x', 'y'],
                      },
                    },
                  },
                  required: ['points', 'isHole'],
                },
              },
            },
            required: ['contours'],
          },
        },
      });
    } catch (primaryErr: any) {
      console.warn('gemini-3.8-flash attempt failed, retrying with gemini-flash-latest:', primaryErr?.message);
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subjectName: {
                type: Type.STRING,
                description: 'Name or brief description of the detected subject',
              },
              contours: {
                type: Type.ARRAY,
                description: 'List of closed polygon loops defining the outline',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    isHole: {
                      type: Type.BOOLEAN,
                      description: 'True if this polygon represents an internal hole',
                    },
                    points: {
                      type: Type.ARRAY,
                      description: 'Sequential polygon points forming a closed loop',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          x: {
                            type: Type.NUMBER,
                            description: 'X coordinate from 0 to 1000',
                          },
                          y: {
                            type: Type.NUMBER,
                            description: 'Y coordinate from 0 to 1000',
                          },
                        },
                        required: ['x', 'y'],
                      },
                    },
                  },
                  required: ['points', 'isHole'],
                },
              },
            },
            required: ['contours'],
          },
        },
      });
    }

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('AI Outline Detection failed:', error);
    return res.status(500).json({
      error: error.message || 'Failed to detect AI outline',
    });
  }
});

async function startServer() {
  // Mount Vite development middlewares in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { openapi } from './documentation/swagger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { csrfProtect, issueCsrf, csrfCookie } from './middleware/csrf.js';
import { optionalAuth } from './middleware/auth.js';
import { loadMemberProfile } from './middleware/loadMember.js';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(issueCsrf);
  app.use(optionalAuth);
  app.use(loadMemberProfile);

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: env.appName,
      time: new Date().toISOString(),
    });
  });

  app.get('/api/v1/auth/csrf', (req, res) => {
    const token = req.cookies.csrf_token || crypto.randomBytes(24).toString('hex');
    csrfCookie(res, token);
    res.json({ data: { csrfToken: token } });
  });

  app.use('/api/v1', csrfProtect, router);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));
  app.use('/public', express.static(path.join(__dirname, '../public')));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

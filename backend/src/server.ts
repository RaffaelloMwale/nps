import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { testConnection } from './config/database';
import { startScheduler } from './modules/scheduler/scheduler';
import logger from './config/logger';

const PORT = parseInt(process.env.PORT || '5000');

async function bootstrap() {
  try {
    // Test DB connection
    await testConnection();

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`🚀 NPS Backend running at http://localhost:${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Health:      http://localhost:${PORT}/health`);
    });

    // Start monthly payment scheduler
    startScheduler();

  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

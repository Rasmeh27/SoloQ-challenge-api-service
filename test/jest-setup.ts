import { Logger } from '@nestjs/common';

// Keeps the test output readable: the application logs are asserted through behaviour,
// not through stdout.
Logger.overrideLogger(false);

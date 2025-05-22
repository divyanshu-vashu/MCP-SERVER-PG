
import express from 'express';
import cors from 'cors';
import countyEVRoutes from './routes/countyEV';
import evRatioRoutes from './routes/evRatio';
import popularModelsRoutes from './routes/popularModels';
import brandComparisonRoutes from './routes/brandComparison';

const app = express();
const PORT = process.env.PORT || 3069;

// Middleware
const corsOptions = {
  origin: '*', // Allow all origins temporarily for debugging
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200,
  credentials: false // Changed to false since we're using '*'
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/county-ev', countyEVRoutes);
app.use('/api/ev-ratio', evRatioRoutes);
app.use('/api/popular-models', popularModelsRoutes);
app.use('/api/brand-comparison', brandComparisonRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is up and running' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});




# syntax=docker/dockerfile:1
FROM python:3.11-slim AS runtime

# Set Python environment flags:
# - PYTHONDONTWRITEBYTECODE: Disables creation of .pyc cache files
# - PYTHONUNBUFFERED: Keeps stdout and stderr unbuffered for container log streaming
# - PORT: Default container listening port expected by InsForge Custom Compute
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install minimal OS runtime packages:
# - ca-certificates: Ensures verified TLS communication with InsForge BaaS and Stripe APIs
# - fonts-dejavu-core: Provides DejaVu Sans TTF for native Indian Rupee (₹) glyph rendering in PDF invoices
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies using layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY . .

# Create and switch to non-root runtime user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser && \
    chown -R appuser:appgroup /app
USER appuser

# Expose default compute port
EXPOSE 8080

# Bind Uvicorn to 0.0.0.0 and listen on the runtime PORT variable (defaulting to 8080)
# Uses shell exec form to ensure PID 1 receives SIGTERM/SIGINT signals cleanly
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]

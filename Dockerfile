FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the whole backend rather than naming files one at a time. The
# previous version only did `COPY main.py .`, so every module main.py
# imports — dashxera.py, admin_auth.py, and anything added later — was
# silently absent from the image. dashxera.py's absence was masked by a
# try/except around its import; admin_auth.py's wasn't, which is what
# turned this from "one feature quietly missing" into a full crash loop.
COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

FROM python:3-alpine
RUN apk add --no-cache postgresql-client
COPY sync.py /sync.py
CMD ["python3", "-u", "/sync.py"]

# Test Ultra-Simple
def application(environ, start_response):
    status = '200 OK'
    output = b'Hello World! Si tu vois ca, le serveur marche.'
    response_headers = [('Content-type', 'text/plain'),
                        ('Content-Length', str(len(output)))]
    start_response(status, response_headers)
    return [output]

import traceback
from django.http import JsonResponse

class ExceptionLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except Exception as e:
            tb = traceback.format_exc()
            return JsonResponse({
                "error": str(e),
                "traceback": tb
            }, status=500)

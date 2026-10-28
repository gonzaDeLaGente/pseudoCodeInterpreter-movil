Funcion Factorial(n)
    Si n <= 1 Entonces
        Retornar 1
    FinSi
    Retornar n * Factorial(n - 1)
FinFuncion

Funcion Fib(n)
    Si n < 2 Entonces
        Retornar n
    SiNo
        Retornar Fib(n-1) + Fib(n-2)
    FinSi
FinFuncion

Algoritmo p
    Escribir Factorial(10)
    Escribir Fib(15)
FinAlgoritmo

Funcion Buscar(x)
    i <- 1
    Mientras Verdadero Hacer
        Para j <- 1 Hasta 100 Hacer
            Repetir
                Si (i*j) MOD x = 0 Y i*j > 50 Entonces
                    Retornar i*j
                FinSi
                i <- i + 1
            Hasta Que i > 3
            i <- 1
        FinPara
    FinMientras
FinFuncion

Algoritmo p
    Escribir Buscar(7)
    Escribir "sigue"
FinAlgoritmo

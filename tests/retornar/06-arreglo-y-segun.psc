Funcion Posicion(v, n, x)
    Para i <- 1 Hasta n Hacer
        Si v[i] = x Entonces
            Retornar i
        FinSi
    FinPara
    Retornar -1
FinFuncion

Funcion Nombre(d)
    Segun d Hacer
        1: Retornar "lunes"
        2: Retornar "martes"
        De Otro Modo: Retornar "otro"
    FinSegun
FinFuncion

Algoritmo p
    Dimension v[5]
    Para i <- 1 Hasta 5 Hacer
        v[i] <- i * 10
    FinPara
    Escribir Posicion(v, 5, 30)
    Escribir Posicion(v, 5, 99)
    Escribir Nombre(2)
    Escribir Nombre(7)
FinAlgoritmo

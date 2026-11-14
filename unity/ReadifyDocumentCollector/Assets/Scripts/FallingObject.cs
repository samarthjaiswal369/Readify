using UnityEngine;

public class FallingObject : MonoBehaviour
{
    public float fallSpeed = 3.5f;
    public float bottomLimit = -6f;
    public bool isObstacle = false;

    private void Update()
    {
        transform.Translate(Vector3.down * fallSpeed * Time.deltaTime, Space.World);

        if (transform.position.y < bottomLimit)
        {
            Destroy(gameObject);
        }
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            if (GameManager.Instance != null)
            {
                if (isObstacle)
                {
                    GameManager.Instance.LoseLife(1);
                }
                else
                {
                    GameManager.Instance.AddScore(1);
                }
            }
            Destroy(gameObject);
        }
    }
}
